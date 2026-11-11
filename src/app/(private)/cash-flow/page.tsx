import { redirect } from "next/navigation";
import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { monthStart, type FinanceReport, type FinanceTransaction } from "@/lib/finance/model";
import { todayInJakarta } from "@/lib/date";
import { CashFlowClient } from "./cash-flow-client";

export default async function CashFlowPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!hasSupabaseConfiguration()) redirect("/login");
  const client = await createSupabaseServerClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect("/login");
  const params = await searchParams;
  const month = monthStart(params.month);
  const page = typeof params.page === "string" && /^[1-9]\d{0,5}$/.test(params.page) ? Number(params.page) : 1;
  if (params.month !== month) redirect(`/cash-flow?month=${month}`);
  const end = new Date(`${month}-01T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1);
  const [report, ledger] = await Promise.all([
    client.rpc("finance_report", { p_month: `${month}-01` }),
    client.from("finance_transactions").select("id,transaction_date,title,kind,person,destination,category,amount,status,debt_id,notes", { count: "exact" })
      .eq("owner_id", user.id).gte("transaction_date", `${month}-01`).lt("transaction_date", end.toISOString().slice(0, 10))
      .order("transaction_date", { ascending: false }).order("created_at", { ascending: false }).order("id")
      .range((page - 1) * 50, page * 50 - 1),
  ]);
  if (report.error || ledger.error || !report.data) throw new Error("Data keuangan belum dapat dimuat.");
  if (page > 1 && !ledger.data?.length) redirect(`/cash-flow?month=${month}`);
  return <CashFlowClient key={month} month={month} page={page} total={ledger.count ?? 0} today={todayInJakarta()}
    report={report.data as FinanceReport} transactions={(ledger.data ?? []) as FinanceTransaction[]} />;
}
