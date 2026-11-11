import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanceCommand } from "./model";

export async function executeFinanceCommand(client: SupabaseClient, ownerId: string, command: FinanceCommand) {
  const table = command.entity === "transaction" ? "finance_transactions" : "finance_debts";
  if (command.action === "delete") return client.from(table).delete().eq("owner_id", ownerId).eq("id", command.data.id).select("id").maybeSingle();
  const { id, ...data } = command.data;
  return id ? client.from(table).update(data).eq("owner_id", ownerId).eq("id", id).select().maybeSingle()
    : client.from(table).insert({ ...data, owner_id: ownerId }).select().single();
}
