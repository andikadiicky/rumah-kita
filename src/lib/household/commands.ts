import { z } from "zod";

const id = z.uuid();
const name = z.string().trim().min(1).max(200);
const date = z.iso.date().refine((value) => value >= "0001-01-01", "Tanggal tidak valid");
const mealType = z.enum(["breakfast", "lunch", "dinner"]);
const list = z.array(z.string().trim().min(1).max(2000)).min(1).max(200);

const essentialSave = z.strictObject({
  entity: z.literal("essential"), action: z.literal("save"),
  data: z.strictObject({
    id: id.optional(), name,
    status: z.enum(["in_stock", "to_buy", "out_of_stock"]),
    planned_purchase_date: date.nullable().default(null),
  }),
});
const recipeSave = z.strictObject({
  entity: z.literal("recipe"), action: z.literal("save"),
  data: z.strictObject({ id: id.optional(), name, servings: z.number().int().min(1).max(1000), ingredients: list, steps: list }),
});
const mealSave = z.strictObject({
  entity: z.literal("meal_slot"), action: z.literal("save"),
  data: z.strictObject({
    meal_date: date, meal_type: mealType,
    recipe_id: id.nullable().default(null),
    meal_name: name.optional(),
  }).superRefine((data, ctx) => {
    if (data.recipe_id && data.meal_name !== undefined) {
      ctx.addIssue({ code: "custom", message: "Pilih resep atau nama menu sendiri", path: ["meal_name"] });
    }
    if (!data.recipe_id && !data.meal_name) {
      ctx.addIssue({ code: "custom", message: "Nama menu wajib diisi", path: ["meal_name"] });
    }
  }),
});
const deleteById = (entity: "essential" | "recipe") => z.strictObject({
  entity: z.literal(entity), action: z.literal("delete"), data: z.strictObject({ id }),
});
const mealDelete = z.strictObject({
  entity: z.literal("meal_slot"), action: z.literal("delete"),
  data: z.strictObject({ meal_date: date, meal_type: mealType }),
});

export const householdCommandSchema = z.union([
  essentialSave, recipeSave, mealSave, deleteById("essential"), deleteById("recipe"), mealDelete,
]);
export type HouseholdCommand = z.infer<typeof householdCommandSchema>;
