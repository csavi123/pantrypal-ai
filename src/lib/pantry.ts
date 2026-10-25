// Basics, spices and the main-ingredient chips live in one file shared with the edge function.
import { isAssumedIngredient, MAIN_INGREDIENTS } from "../../supabase/functions/_shared/kitchen-basics.ts";

export const DAILY_LIMIT = 5;
export const COOK_TIMES = [15, 30, 45, 60] as const;
export const RECIPE_COUNTS = [1, 2, 3] as const;
export const CUISINES = ["Any", "Indian", "Italian", "Mexican", "Mediterranean", "Asian", "American"] as const;
export const DIETS = ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "egg-free", "halal"] as const;
export { isAssumedIngredient };
export const QUICK_ADD = MAIN_INGREDIENTS.filter((n) => !isAssumedIngredient(n));

export type Ingredient = { name: string; quantity: number | null; unit: string | null; in_pantry: boolean; pantry_shortfall?: string | null; is_staple?: boolean; optional?: boolean };
export type Nutrition = {
  calories_kcal: number | null;
  protein_g: number | null;
  is_estimate: true;
  source: string;
  unavailable_items: string[];
  protein_note?: string | null;
};
export type GeneratedRecipe = {
  title: string;
  cuisine: string;
  cook_time_minutes: number;
  servings: number;
  ingredients: Ingredient[];
  missing_ingredients: string[];
  steps: string[];
  substitutions: { ingredient: string; substitute: string }[];
  nutrition: Nutrition;
};
export type GenerateResponse = {
  recipes: GeneratedRecipe[];
  remaining_generations_today: number;
  /** The server's DAILY_GENERATION_LIMIT; older deployments may omit it. */
  daily_limit?: number;
  message: string | null;
};

// Mirrors the edge function's input limits.
export const MAX_INGREDIENTS = 30;
export const MAX_NAME_LENGTH = 60;

export function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

export type FunctionError = { code: string; message: string; fields?: Record<string, string> };

/**
 * Read the { error: { code, message, fields } } body from a supabase.functions.invoke failure.
 * Anything without that shape (offline, CORS, a crash) comes back as code "NETWORK".
 */
export async function readFunctionError(error: unknown): Promise<FunctionError> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json();
      if (body?.error?.code) {
        return { code: String(body.error.code), message: String(body.error.message ?? ""), fields: body.error.fields };
      }
    } catch {
      /* not JSON */
    }
  }
  return { code: "NETWORK", message: "" };
}
