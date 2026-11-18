import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanceCommand } from "./model";

export async function executeFinanceCommand(client: SupabaseClient, ownerId: string, command: FinanceCommand) {
  const tables = { transaction: "finance_transactions", debt: "finance_debts", debt_payment: "finance_debt_payments", category: "finance_categories" };
  const table = tables[command.entity];
  if (command.action === "delete") return client.from(table).delete().eq("owner_id", ownerId).eq("id", command.data.id).select("id").maybeSingle();
  const { id, ...data } = command.data;
  // The linked debt of an existing record is immutable; only record fields change.
  if (command.entity === "debt_payment" && id) {
    const { debt_id: debtId, ...values } = command.data;
    delete values.id;
    return client.from(table).update(values).eq("owner_id", ownerId).eq("id", id).eq("debt_id", debtId).select().maybeSingle();
  }
  return id ? client.from(table).update(data).eq("owner_id", ownerId).eq("id", id).select().maybeSingle()
    : client.from(table).insert({ ...data, owner_id: ownerId }).select().single();
}
