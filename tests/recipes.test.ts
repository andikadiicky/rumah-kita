import assert from "node:assert/strict";
import { test } from "node:test";
import { recipeEntriesToText, recipeTextToEntries } from "../src/lib/recipes/model";
import { householdCommandSchema } from "../src/lib/household/commands";

test("recipe multiline text, including blank lines, survives API validation and editing", () => {
  const ingredients = "Beras\nAir\n\nBumbu:\nGaram";
  const steps = "Cuci beras.\n\nTambahkan air.\nMasak.";
  const parsed = householdCommandSchema.parse({ entity: "recipe", action: "save", data: {
    name: "Nasi", servings: 2, ingredients: recipeTextToEntries(ingredients), steps: recipeTextToEntries(steps),
  } });
  assert.equal(parsed.entity, "recipe");
  if (parsed.entity !== "recipe" || parsed.action !== "save") throw new Error("Expected recipe save");
  assert.equal(recipeEntriesToText(parsed.data.ingredients), ingredients);
  assert.equal(recipeEntriesToText(parsed.data.steps), steps);
  assert.equal(recipeEntriesToText(recipeTextToEntries("Beras\r\nAir\r\n\r\nGaram")), "Beras\nAir\n\nGaram");
  assert.deepEqual(recipeTextToEntries(" \n \n "), []);
});
