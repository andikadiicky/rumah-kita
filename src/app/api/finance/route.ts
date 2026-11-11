import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { isSameOrigin } from "@/lib/request-origin";
import { financeCommandSchema } from "@/lib/finance/model";
import { executeFinanceCommand } from "@/lib/finance/execute";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: NextRequest) {
  try {
    if (!hasSupabaseConfiguration()) return json({ error: "Silakan masuk terlebih dahulu." }, 401);
    const client = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return json({ error: "Silakan masuk terlebih dahulu." }, 401);
    if (!isSameOrigin(request)) return json({ error: "Permintaan tidak diizinkan." }, 403);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Gunakan JSON." }, 415);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Data tidak valid." }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 1_000_000) { await reader.cancel(); return json({ error: "Data terlalu besar." }, 413); }
      chunks.push(value);
    }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return json({ error: "JSON tidak valid." }, 400); }
    const parsed = financeCommandSchema.safeParse(body);
    if (!parsed.success) return json({ error: "Data keuangan tidak valid. Periksa isian Anda." }, 400);
    const { data, error } = await executeFinanceCommand(client, user.id, parsed.data);
    if (error) return json({ error: "Perubahan ditolak. Periksa nominal, sisa utang, tanggal, dan sumber uang." }, 400);
    if (!data) return json({ error: "Data tidak ditemukan." }, 404);
    return json({ ok: true, data });
  } catch { return json({ error: "Layanan sementara tidak tersedia." }, 503); }
}
