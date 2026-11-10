import { redirect } from "next/navigation";
import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { todayInJakarta } from "@/lib/date";
import { addCalendarDays, selectedMonday, type MealSlot, type RecipeOption } from "@/lib/meal-plan/model";
import { MealPlanClient } from "./meal-plan-client";

export default async function MealPlanPage({ searchParams }: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (!hasSupabaseConfiguration()) redirect("/login");
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");
  const query = await searchParams;
  const today = todayInJakarta();
  const monday = selectedMonday(query.week, today);
  if (query.week !== monday) redirect(`/meal-plan?week=${monday}`);
  const nextMonday = addCalendarDays(monday, 7);
  const [slots, recipes] = await Promise.all([
    supabase.from("meal_slots").select("id,meal_date,meal_type,recipe_id,meal_name")
      .eq("owner_id", user.id).gte("meal_date", monday).lt("meal_date", nextMonday)
      .order("meal_date").order("meal_type"),
    supabase.from("recipes").select("id,name").eq("owner_id", user.id).order("name").order("id"),
  ]);
  if (slots.error || recipes.error) throw new Error("Rencana makan tidak dapat dimuat.");
  return <MealPlanClient key={monday} monday={monday} today={today}
    slots={(slots.data ?? []) as MealSlot[]} recipes={(recipes.data ?? []) as RecipeOption[]} />;
}
