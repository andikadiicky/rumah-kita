import { redirect } from "next/navigation";
import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import type { Recipe } from "@/lib/recipes/model";
import { RecipesClient } from "./recipes-client";

export default async function RecipesPage() {
  if (!hasSupabaseConfiguration()) redirect("/login");
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");
  const { data, error } = await supabase.from("recipes")
    .select("id,name,servings,ingredients,steps").eq("owner_id", user.id)
    .order("created_at", { ascending: false }).order("id");
  if (error) throw new Error("Resep keluarga tidak dapat dimuat.");
  return <RecipesClient recipes={(data ?? []) as Recipe[]} />;
}
