import { redirect } from "next/navigation";
import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { todayInJakarta } from "@/lib/date";
import type { Essential } from "@/lib/essentials/model";
import { EssentialsClient } from "./essentials-client";

export default async function EssentialsPage({ searchParams }: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (!hasSupabaseConfiguration()) redirect("/login");
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const { data, error } = await supabase.from("essentials")
    .select("id,name,status,planned_purchase_date")
    .eq("owner_id", user.id).order("created_at", { ascending: false }).order("id");
  if (error) throw new Error("Kebutuhan rumah tidak dapat dimuat.");
  const filter = (await searchParams).filter;
  const initialFilter = filter === "to_buy" || filter === "out_of_stock" ? filter : "all";
  return <EssentialsClient initialFilter={initialFilter} key={initialFilter} items={(data ?? []) as Essential[]} today={todayInJakarta()} />;
}
