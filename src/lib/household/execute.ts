import type { SupabaseClient } from "@supabase/supabase-js";
import type { HouseholdCommand } from "./commands";

export async function executeHouseholdCommand(supabase: SupabaseClient, ownerId: string, command: HouseholdCommand) {
  if (command.entity === "meal_slot") {
    if (command.action === "delete") {
      return supabase.from("meal_slots").delete().eq("owner_id", ownerId)
        .eq("meal_date", command.data.meal_date).eq("meal_type", command.data.meal_type).select("id").maybeSingle();
    }
    // The DB trigger supplies the saved recipe's current name atomically.
    return supabase.from("meal_slots").upsert({
      ...command.data, meal_name: command.data.meal_name ?? "", owner_id: ownerId,
    }, { onConflict: "owner_id,meal_date,meal_type" }).select().single();
  }

  const table = command.entity === "essential" ? "essentials" : "recipes";
  if (command.action === "delete") {
    return supabase.from(table).delete().eq("owner_id", ownerId).eq("id", command.data.id).select("id").maybeSingle();
  }
  const { id, ...values } = command.data;
  if (id) {
    return supabase.from(table).update(values).eq("owner_id", ownerId).eq("id", id).select().maybeSingle();
  }
  return supabase.from(table).insert({ ...values, owner_id: ownerId }).select().single();
}
