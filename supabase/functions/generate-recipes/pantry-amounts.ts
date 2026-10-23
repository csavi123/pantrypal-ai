// Flags pantry ingredients a recipe uses more of than the user said they have.
// Only compares amounts that can be compared reliably; otherwise leaves the ingredient alone.

import { countLike, toGrams, unitKey } from "./nutrition.ts";
import { pantryKey, type Ingredient, type Recipe, type RecipeIngredient } from "./recipe-rules.ts";

const TOLERANCE = 1.05; // ignore rounding differences up to 5%

function haveText(have: Ingredient): string {
  return `have ${[have.quantity, have.unit].filter((x) => x !== null && x !== "").join(" ")}`;
}

/** True when the recipe needs more than `have`; null when the amounts can't be compared. */
function needsMore(used: RecipeIngredient, have: Ingredient): boolean | null {
  if (used.quantity === null || have.quantity === null) return null;
  const u = unitKey(used.unit);
  const h = unitKey(have.unit);
  if (u === h || (countLike(u) && countLike(h))) return used.quantity > have.quantity * TOLERANCE;
  // Different units: compare by weight. Use the recipe's name for both so piece weights match.
  const usedG = toGrams(used);
  const haveG = toGrams({ ...used, quantity: have.quantity, unit: have.unit });
  if (usedG === null || haveG === null) return null;
  return usedG > haveG * TOLERANCE;
}

export function markShortages(recipes: Recipe[], pantry: Ingredient[]): Recipe[] {
  const byKey = new Map<string, Ingredient>();
  for (const p of pantry) {
    const key = pantryKey(p.name);
    if (key && p.quantity !== null && !byKey.has(key)) byKey.set(key, p);
  }
  if (!byKey.size) return recipes;

  return recipes.map((r) => {
    const ingredients = r.ingredients.map((i) => {
      const have = i.in_pantry ? byKey.get(pantryKey(i.name)) : undefined;
      return have && needsMore(i, have) ? { ...i, pantry_shortfall: haveText(have) } : i;
    });
    const short = ingredients.filter((i) => i.pantry_shortfall);
    if (!short.length) return r;
    return {
      ...r,
      ingredients,
      missing_ingredients: [
        ...r.missing_ingredients,
        ...short.map((i) => `${i.name} (need more, ${i.pantry_shortfall})`),
      ],
    };
  });
}
