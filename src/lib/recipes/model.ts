export type Recipe = {
  id: string;
  name: string;
  servings: number;
  ingredients: string[];
  steps: string[];
};

/** Keep blank-line runs inside entries so API trimming won't remove them. */
export function recipeTextToEntries(value: string): string[] {
  return value.replace(/\r\n?/g, "\n").replace(/^[\t ]+$/gm, "")
    .trim().split(/(?<!\n)\n(?!\n)/).map((entry) => entry.trim()).filter(Boolean);
}

export function recipeEntriesToText(entries: string[]): string {
  return entries.join("\n");
}
