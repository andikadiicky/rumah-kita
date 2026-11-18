import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { categoryDetailsQuery } from "@/lib/finance/category-details";
import { shiftMonth } from "@/lib/finance/model";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: NextRequest) {
  try {
    if (!hasSupabaseConfiguration()) return json({ error: "Silakan masuk terlebih dahulu." }, 401);
    const client = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return json({ error: "Silakan masuk terlebih dahulu." }, 401);
    const params = request.nextUrl.searchParams;
    const parsed = categoryDetailsQuery.safeParse(Object.fromEntries(params));
    if (!parsed.success || [...params.keys()].some((key) => params.getAll(key).length !== 1)) return json({ error: "Bulan, kategori, atau halaman tidak valid." }, 400);
    const { month, category, page } = parsed.data;
    // The reporting boundary allows December 9998; its exclusive end is January 9999.
    const end = month.endsWith("-12") ? `${String(Number(month.slice(0, 4)) + 1).padStart(4, "0")}-01` : shiftMonth(month, 1);
    const { data, count, error } = await client.from("finance_transactions")
      .select("id,transaction_date,title,person,amount,status,notes", { count: "exact" })
      .eq("owner_id", user.id).eq("kind", "expense").eq("category", category).in("status", ["paid", "pending"])
      .gte("transaction_date", `${month}-01`).lt("transaction_date", `${end}-01`)
      .order("transaction_date", { ascending: false }).order("created_at", { ascending: false }).order("id")
      .range((page - 1) * 50, page * 50 - 1);
    if (error) return json({ error: "Rincian belum dapat dimuat. Coba lagi." }, 503);
    return json({ transactions: data ?? [], total: count ?? 0 });
  } catch { return json({ error: "Layanan sementara tidak tersedia. Coba lagi." }, 503); }
}
