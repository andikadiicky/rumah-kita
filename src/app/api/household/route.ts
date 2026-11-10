import { isSameOrigin } from "@/lib/request-origin";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { householdCommandSchema } from "@/lib/household/commands";
import { executeHouseholdCommand } from "@/lib/household/execute";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function authenticatedClient() {
  if (!hasSupabaseConfiguration()) return null;
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return error || !user ? null : { supabase, user };
}

export async function GET() {
  try {
    const auth = await authenticatedClient();
    if (!auth) return json({ error: "Silakan masuk terlebih dahulu." }, 401);
    return json({ ok: true });
  } catch {
    return json({ error: "Layanan sementara tidak tersedia." }, 503);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticatedClient();
    if (!auth) return json({ error: "Silakan masuk terlebih dahulu." }, 401);
    // Browser mutations must originate from this application. No CORS access.
    if (!isSameOrigin(request)) {
      return json({ error: "Permintaan tidak diizinkan." }, 403);
    }
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return json({ error: "Gunakan JSON." }, 415);
    }
    // Bound the stream too: Content-Length may be missing or inaccurate.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Data tidak valid." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_000_000) {
        await reader.cancel();
        return json({ error: "Data terlalu besar." }, 413);
      }
      chunks.push(value);
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return json({ error: "JSON tidak valid." }, 400);
    }
    const parsed = householdCommandSchema.safeParse(body);
    if (!parsed.success) return json({ error: "Data tidak valid. Periksa isian Anda." }, 400);
    const { data, error } = await executeHouseholdCommand(auth.supabase, auth.user.id, parsed.data);
    if (error) return json({ error: "Perubahan tidak dapat disimpan." }, 400);
    if (!data) return json({ error: "Data tidak ditemukan." }, 404);
    return json({ ok: true, data });
  } catch {
    return json({ error: "Layanan sementara tidak tersedia." }, 503);
  }
}
