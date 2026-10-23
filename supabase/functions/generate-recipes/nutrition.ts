// Per-serving calorie and protein estimates from USDA FoodData Central.
// Every number comes from USDA data and the conversion tables below; when either
// is missing for an ingredient, that ingredient is reported as unavailable instead.

import { normalize, type Nutrition, type Recipe, type RecipeIngredient } from "./recipe-rules.ts";

const FDC_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
const TIMEOUT_MS = 5_000;
// Lower rank wins. Foundation and SR Legacy are preferred; FNDDS is the fallback.
const DATA_TYPES = ["Foundation", "SR Legacy", "Survey (FNDDS)"];
const ENERGY_KCAL_IDS = [1008, 2048, 2047]; // Energy; Atwater specific; Atwater general
const PROTEIN_ID = 1003;
const ML_PER_CUP = 236.6;

// ---------- unit conversion ----------

const MASS_G: Record<string, number> = {
  mg: 0.001,
  g: 1,
  gram: 1,
  gr: 1,
  kg: 1000,
  kilogram: 1000,
  oz: 28.35,
  ounce: 28.35,
  lb: 453.6,
  pound: 453.6,
};
const VOLUME_ML: Record<string, number> = {
  ml: 1,
  milliliter: 1,
  millilitre: 1,
  l: 1000,
  liter: 1000,
  litre: 1000,
  cup: ML_PER_CUP,
  c: ML_PER_CUP,
  tbsp: ML_PER_CUP / 16,
  tablespoon: ML_PER_CUP / 16,
  tbs: ML_PER_CUP / 16,
  tsp: ML_PER_CUP / 48,
  teaspoon: ML_PER_CUP / 48,
};
const PIECE_UNITS = new Set([
  "",
  "piece",
  "pc",
  "whole",
  "item",
  "small",
  "medium",
  "large",
  "clove",
]);

/** Units that mean "a count of whole items" (including no unit). */
export function countLike(unit: string): boolean {
  return PIECE_UNITS.has(unit);
}

// Liquids treated as 1 g per ml.
const WATER_LIKE = ["water", "broth", "stock", "juice", "vinegar", "tea", "coffee"];

// Grams per US cup (USDA household measures). tbsp = 1/16 cup, tsp = 1/48 cup.
const GRAMS_PER_CUP: Record<string, number> = {
  milk: 244,
  "coconut milk": 226,
  yogurt: 245,
  "greek yogurt": 245,
  cream: 238,
  oil: 218,
  "olive oil": 216,
  butter: 227,
  ghee: 205,
  "peanut butter": 258,
  honey: 339,
  sugar: 200,
  "brown sugar": 220,
  flour: 125,
  "chickpea flour": 92,
  rice: 185,
  "brown rice": 190,
  "cooked rice": 158,
  quinoa: 170,
  "cooked quinoa": 185,
  oat: 81,
  lentil: 192,
  "cooked lentil": 198,
  chickpea: 164,
  bean: 172,
  pea: 145,
  corn: 154,
  tofu: 252,
  spinach: 30,
  onion: 160,
  tomato: 180,
  "bell pepper": 149,
  carrot: 128,
  broccoli: 91,
  cheese: 113,
  parmesan: 100,
  garlic: 136,
  ginger: 96,
  salt: 292,
  "black pepper": 110,
  pepper: 110,
  cumin: 101,
  "cumin seed": 101,
  turmeric: 144,
  paprika: 110,
  "chili powder": 130,
  cinnamon: 125,
  coriander: 86,
};

// Grams per whole item (USDA "medium" or standard sizes).
const GRAMS_PER_PIECE: Record<string, number> = {
  egg: 50,
  onion: 110,
  "red onion": 110,
  tomato: 123,
  garlic: 3,
  potato: 213,
  "sweet potato": 130,
  carrot: 61,
  "bell pepper": 119,
  lemon: 58,
  lime: 67,
  banana: 118,
  apple: 182,
  avocado: 136,
  cucumber: 301,
  zucchini: 196,
  "chicken breast": 174,
  "green chili": 45,
};

// Whole queries rewritten so the right food matches ("water" alone also matches "water chestnuts").
const EXACT_QUERIES: Record<string, string> = { water: "water tap" };

// Common names USDA doesn't use.
const SYNONYMS: Record<string, string> = {
  brinjal: "eggplant",
  aubergine: "eggplant",
  capsicum: "bell pepper",
  courgette: "zucchini",
  garbanzo: "chickpea",
  curd: "yogurt",
  besan: "chickpea flour",
  dal: "lentil",
  daal: "lentil",
  cilantro: "coriander",
  scallion: "green onion",
  "spring onion": "green onion",
};

// Words dropped from the USDA query (preparation and size, not food identity).
const PREP_WORDS = new Set(
  [
    "chopped",
    "diced",
    "minced",
    "sliced",
    "grated",
    "shredded",
    "crushed",
    "peeled",
    "halved",
    "cubed",
    "beaten",
    "finely",
    "roughly",
    "thinly",
    "fresh",
    "freshly",
    "small",
    "medium",
    "large",
    "optional",
    "to",
    "taste",
    "drained",
    "rinsed",
    "boneless",
    "skinless",
    "trimmed",
    "of",
    "a",
    "an",
    "the",
    "for",
    "and",
    "or",
    "into",
    "piece",
    "clove",
    "pinch",
    "handful",
  ].map((w) => normalize(w)),
);

/** Longest table key contained (as whole words) in the ingredient name. */
function lookupTable(name: string, table: Record<string, number>): number | null {
  const n = ` ${normalize(name)} `;
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);
  const hit = keys.find((k) => n.includes(` ${normalize(k)} `));
  return hit ? table[hit]! : null;
}

/** A weight written in the name or unit, e.g. "1 can (400g) chickpeas". */
function statedWeight(text: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*(g|kg|oz)\b/i.exec(text);
  if (!m) return null;
  return Number(m[1]) * MASS_G[m[2]!.toLowerCase()]!;
}

export function unitKey(unit: string | null): string {
  const u = (unit ?? "").toLowerCase().replace(/\./g, "").trim();
  if (u === "fl oz" || u === "fluid ounce" || u === "fluid ounces") return "fl oz";
  return u.endsWith("s") && u.length > 2 && u !== "lbs" ? u.slice(0, -1) : u === "lbs" ? "lb" : u;
}

/** Grams for an ingredient, or null when the amount can't be converted reliably. */
export function toGrams(ing: RecipeIngredient): number | null {
  const q = ing.quantity;
  if (q === null || !(q > 0)) return null;
  const u = unitKey(ing.unit);

  if (u in MASS_G) return q * MASS_G[u]!;

  const ml = u === "fl oz" ? q * 29.57 : u in VOLUME_ML ? q * VOLUME_ML[u]! : null;
  if (ml !== null) {
    const perCup = lookupTable(ing.name, GRAMS_PER_CUP);
    if (perCup !== null) return (ml * perCup) / ML_PER_CUP;
    const n = ` ${normalize(ing.name)} `;
    return WATER_LIKE.some((w) => n.includes(` ${w} `)) ? ml : null;
  }

  if (PIECE_UNITS.has(u)) {
    const each = lookupTable(ing.name, GRAMS_PER_PIECE) ?? statedWeight(ing.name);
    return each !== null ? q * each : null;
  }

  // Cans, jars, packets etc. only when the weight is written out.
  const each = statedWeight(`${ing.name} ${ing.unit ?? ""}`);
  return each !== null ? q * each : null;
}

// ---------- USDA lookup ----------

type Per100g = { kcal: number; protein: number; description: string };
export type Lookup =
  { status: "ok"; food: Per100g } | { status: "no_match" } | { status: "error"; reason: string };

/** Search terms for USDA: food identity only, with common synonyms mapped. */
export function usdaQuery(name: string): string {
  const words = normalize(name.replace(/\([^)]*\)/g, " "))
    .split(" ")
    .filter((w) => w && !/\d/.test(w) && !PREP_WORDS.has(w));
  let text = ` ${words.join(" ")} `;
  for (const [from, to] of Object.entries(SYNONYMS)) {
    text = text.replace(` ${normalize(from)} `, ` ${normalize(to)} `);
  }
  const query = text.trim().split(" ").filter(Boolean).join(" ");
  return EXACT_QUERIES[query] ?? query;
}

const PREPARED_WORDS = ["cooked", "canned", "boiled", "roasted", "fried", "dried"];

export type FdcFood = {
  description?: string;
  dataType?: string;
  foodNutrients?: { nutrientId?: number; unitName?: string; value?: number }[];
};

function per100g(food: FdcFood): Per100g | null {
  const nutrients = food.foodNutrients ?? [];
  const value = (id: number, unit: string) =>
    nutrients.find(
      (n) =>
        n.nutrientId === id && n.unitName?.toUpperCase() === unit && typeof n.value === "number",
    )?.value;
  const kcal = ENERGY_KCAL_IDS.map((id) => value(id, "KCAL")).find((v) => v !== undefined);
  const protein = value(PROTEIN_ID, "G");
  return kcal !== undefined && protein !== undefined
    ? { kcal, protein, description: food.description ?? "" }
    : null;
}

export async function searchUsda(query: string, apiKey: string): Promise<Lookup> {
  if (!query) return { status: "no_match" };
  let data: { foods?: FdcFood[] };
  try {
    const res = await fetch(FDC_SEARCH_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify({ query, dataType: DATA_TYPES, pageSize: 25, requireAllWords: true }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { status: "error", reason: `http_${res.status}` };
    data = await res.json();
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "TimeoutError";
    return { status: "error", reason: timedOut ? "timeout" : "network" };
  }

  return pickFood(query, data.foods ?? []);
}

/**
 * Choose the best USDA food for a query. Every query word must appear in the description.
 * Ranking, in order:
 *  1. how well the food's main name (text before the first comma) matches: "Salt, table" beats
 *     "Pork, cured, salt pork" for "salt";
 *  2. data type: Foundation > SR Legacy > FNDDS;
 *  3. raw over prepared (unless the query asks for cooked/canned/...), whole over parts (egg);
 *  4. USDA's own relevance order.
 */
export function pickFood(query: string, foods: FdcFood[]): Lookup {
  const qWords = query.split(" ");
  const wantsPrepared = qWords.some((w) => PREPARED_WORDS.includes(w));
  const candidates = foods
    .map((f, i) => {
      const description = f.description ?? "";
      const desc = ` ${normalize(description)} `;
      const head = normalize(description.replace(/\([^)]*\)/g, " ").split(",")[0] ?? "");
      const rank = DATA_TYPES.indexOf(f.dataType ?? "");
      const nutrients = per100g(f);
      if (rank < 0 || !nutrients || !qWords.every((w) => desc.includes(` ${w} `))) return null;
      const headWords = head.split(" ");
      const nameMatch = head === query ? 0 : qWords.every((w) => headWords.includes(w)) ? 1 : 2;
      const formPenalty =
        (wantsPrepared || desc.includes(" raw ") ? 0 : 1) + (desc.includes(" whole ") ? 0 : 0.5);
      return { nutrients, sort: [nameMatch, rank, formPenalty, i] };
    })
    .filter((c): c is { nutrients: Per100g; sort: number[] } => c !== null)
    .sort((a, b) => {
      for (let k = 0; k < a.sort.length; k++)
        if (a.sort[k] !== b.sort[k]) return a.sort[k]! - b.sort[k]!;
      return 0;
    });

  return candidates[0] ? { status: "ok", food: candidates[0].nutrients } : { status: "no_match" };
}

// ---------- per recipe ----------

function proteinNote(protein: number | null, goal: number | null): string | null {
  if (goal === null) return null;
  if (protein === null) return `Not enough reference data to check your ${goal} g protein target.`;
  return protein < goal
    ? `About ${protein} g protein per serving, below your ${goal} g target.`
    : null;
}

function nutritionFor(
  recipe: Recipe,
  lookups: Map<string, Lookup>,
  goal: number | null,
): Nutrition {
  let kcal = 0;
  let protein = 0;
  const unavailable: string[] = [];
  for (const ing of recipe.ingredients) {
    const grams = toGrams(ing);
    const found = lookups.get(usdaQuery(ing.name));
    if (grams === null || found?.status !== "ok") {
      unavailable.push(ing.name);
      continue;
    }
    kcal += (found.food.kcal * grams) / 100;
    protein += (found.food.protein * grams) / 100;
  }

  const tooSparse = unavailable.length > recipe.ingredients.length / 2;
  const proteinPerServing = tooSparse ? null : Math.round(protein / recipe.servings);
  return {
    calories_kcal: tooSparse ? null : Math.round(kcal / recipe.servings),
    protein_g: proteinPerServing,
    is_estimate: true,
    source: tooSparse ? "unavailable" : "USDA FoodData Central",
    unavailable_items: unavailable,
    protein_note: proteinNote(proteinPerServing, goal),
  };
}

/**
 * Replace each recipe's nutrition with USDA-based estimates (model numbers are never used).
 * Never throws: if USDA is unreachable, recipes come back with nutrition unavailable.
 * Recipes that meet the protein target are sorted first.
 */
export async function addNutrition(
  recipes: Recipe[],
  apiKey: string | undefined,
  proteinGoal: number | null,
  userId: string,
): Promise<Recipe[]> {
  const queries = [...new Set(recipes.flatMap((r) => r.ingredients.map((i) => usdaQuery(i.name))))];
  const lookups = new Map<string, Lookup>();
  if (apiKey) {
    const results = await Promise.all(queries.map((q) => searchUsda(q, apiKey)));
    queries.forEach((q, i) => lookups.set(q, results[i]!));
  }

  const statuses = [...lookups.values()].map((l) => l.status);
  console.log(
    JSON.stringify({
      event: "nutrition",
      user_id: userId,
      configured: Boolean(apiKey),
      lookups: queries.length,
      ok: statuses.filter((s) => s === "ok").length,
      no_match: statuses.filter((s) => s === "no_match").length,
      errors: statuses.filter((s) => s === "error").length,
      // e.g. {"http_403": 7} means a bad USDA_API_KEY; http_429 = rate limited; timeout = slow USDA
      error_reasons: [...lookups.values()].reduce<Record<string, number>>((acc, l) => {
        if (l.status === "error") acc[l.reason] = (acc[l.reason] ?? 0) + 1;
        return acc;
      }, {}),
    }),
  );

  const withNutrition = recipes.map((r) => ({
    ...r,
    nutrition: nutritionFor(r, lookups, proteinGoal),
  }));
  if (proteinGoal === null) return withNutrition;
  // Meets target first, then unknown, then short. Stable within each group.
  const rank = (r: Recipe) =>
    r.nutrition.protein_g === null ? 1 : r.nutrition.protein_g >= proteinGoal ? 0 : 2;
  return withNutrition
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
    .map((x) => x.r);
}
