export const DAILY_LIMIT = 5;
export const COOK_TIMES = [15, 30, 45, 60] as const;
export const CUISINES = ["Any", "Indian", "Italian", "Mexican", "Mediterranean", "Asian", "American"] as const;
export const DIETS = ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "egg-free", "halal"] as const;
export const QUICK_ADD = ["Eggs", "Chicken breast", "Rice", "Onion", "Garlic", "Tomato", "Spinach", "Greek yogurt", "Lentils", "Tofu", "Paneer", "Chickpeas"];

export type Ingredient = { name: string; quantity: number | null; unit: string | null; in_pantry: boolean };
export type Nutrition = {
  calories_kcal: number | null;
  protein_g: number | null;
  is_estimate: true;
  source: string;
  unavailable_items: string[];
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
  message: string | null;
};

export function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

/** Pull a readable message out of a supabase.functions.invoke failure. */
export async function describeFunctionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json();
      if (body?.error?.message) return String(body.error.message);
    } catch {
      /* not JSON */
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong while generating recipes.";
}
