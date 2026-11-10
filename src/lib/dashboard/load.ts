import type { SupabaseClient } from "@supabase/supabase-js";
import { addCalendarDays } from "../meal-plan/model";

const fields = "id,name,status,planned_purchase_date";
export const DASHBOARD_PREVIEW_LIMIT = 6;

/** Every request uses the verified user's session and explicit owner filtering. */
export async function loadDashboard(supabase: SupabaseClient, ownerId: string, today: string) {
  const [empty, overdue, upcoming, meals] = await Promise.all([
    supabase.from("essentials").select(fields, { count: "exact" }).eq("owner_id", ownerId)
      .eq("status", "out_of_stock").order("name").order("id").limit(DASHBOARD_PREVIEW_LIMIT),
    supabase.from("essentials").select(fields, { count: "exact" }).eq("owner_id", ownerId)
      .in("status", ["to_buy", "out_of_stock"]).lt("planned_purchase_date", today)
      .order("planned_purchase_date").order("name").limit(DASHBOARD_PREVIEW_LIMIT),
    supabase.from("essentials").select(fields, { count: "exact" }).eq("owner_id", ownerId)
      .in("status", ["to_buy", "out_of_stock"]).gte("planned_purchase_date", today)
      .order("planned_purchase_date").order("name").limit(DASHBOARD_PREVIEW_LIMIT),
    supabase.from("meal_slots").select("id,meal_date,meal_type,recipe_id,meal_name").eq("owner_id", ownerId)
      .gte("meal_date", today).lt("meal_date", addCalendarDays(today, 1)),
  ]);
  const recipeIds = [...new Set((meals.data ?? []).map((slot) => slot.recipe_id as string | null).filter((id): id is string => !!id))];
  const recipes = recipeIds.length ? await supabase.from("recipes").select("id,name")
    .eq("owner_id", ownerId).in("id", recipeIds) : { data: [], error: null };
  return { empty, overdue, upcoming, meals, recipes };
}
