import { z } from "zod";

export const mealTypes = ["breakfast", "lunch", "dinner"] as const;
export type MealType = typeof mealTypes[number];
export const mealLabels: Record<MealType, string> = {
  breakfast: "Sarapan", lunch: "Makan Siang", dinner: "Makan Malam",
};
export type RecipeOption = { id: string; name: string };
export type MealSlot = {
  id: string; meal_date: string; meal_type: MealType;
  recipe_id: string | null; meal_name: string;
};

export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  const result = value.toISOString().slice(0, 10);
  if (!z.iso.date().safeParse(result).success || result < "0001-01-01") throw new RangeError("Tanggal di luar jangkauan");
  return result;
}

export function mondayForDate(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addCalendarDays(date, -((day + 6) % 7));
}

export function selectedMonday(value: unknown, today: string): string {
  if (typeof value === "string" && z.iso.date().safeParse(value).success && value >= "0001-01-01") {
    try {
      const monday = mondayForDate(value);
      addCalendarDays(monday, 7);
      return monday;
    } catch { /* Fall back for unsupported boundary years. */ }
  }
  return mondayForDate(today);
}

export function adjacentWeek(monday: string, days: -7 | 7): string | null {
  try {
    const next = addCalendarDays(monday, days);
    addCalendarDays(next, 7);
    return next;
  } catch { return null; }
}

export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addCalendarDays(monday, index));
}

export function calendarLabel(date: string, weekday = false): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC", ...(weekday ? { weekday: "long" } : {}),
    day: "numeric", month: "long", year: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function displayedMealName(slot: MealSlot, recipes: RecipeOption[]): string {
  return recipes.find((recipe) => recipe.id === slot.recipe_id)?.name ?? slot.meal_name;
}
