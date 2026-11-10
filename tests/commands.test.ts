import assert from "node:assert/strict";
import { test } from "node:test";
import { householdCommandSchema as schema } from "../src/lib/household/commands";

const uuid = "11111111-1111-4111-8111-111111111111";

test("accepts all six save/delete command variants", () => {
  for (const command of [
    { entity: "essential", action: "save", data: { name: "Beras", status: "to_buy", planned_purchase_date: "2028-02-29" } },
    { entity: "recipe", action: "save", data: { name: "Nasi", servings: 2, ingredients: ["Beras"], steps: ["Masak"] } },
    { entity: "meal_slot", action: "save", data: { meal_date: "2026-11-09", meal_type: "lunch", recipe_id: uuid } },
    { entity: "meal_slot", action: "save", data: { meal_date: "2026-11-09", meal_type: "dinner", meal_name: "Soto" } },
    { entity: "essential", action: "delete", data: { id: uuid } },
    { entity: "recipe", action: "delete", data: { id: uuid } },
    { entity: "meal_slot", action: "delete", data: { meal_date: "2026-11-09", meal_type: "lunch" } },
  ]) assert.equal(schema.safeParse(command).success, true);
});

test("rejects spoofed ownership, invalid dates, enums, and ambiguous meal choices", () => {
  const meal = { meal_date: "2026-11-09", meal_type: "lunch", meal_name: "Soto" };
  for (const data of [
    { ...meal, owner_id: uuid },
    { ...meal, meal_date: "2026-02-29" },
    { ...meal, meal_date: "2026-11-09T00:00:00Z" },
    { ...meal, meal_date: "0000-01-01" },
    { ...meal, meal_type: "snack" },
    { ...meal, recipe_id: uuid },
    { meal_date: meal.meal_date, meal_type: meal.meal_type },
    { ...meal, meal_name: "   " },
  ]) assert.equal(schema.safeParse({ entity: "meal_slot", action: "save", data }).success, false);
  assert.equal(schema.safeParse({ entity: "recipe", action: "save", data: {
    name: "Nasi", servings: 0, ingredients: [], steps: [""],
  } }).success, false);
});
