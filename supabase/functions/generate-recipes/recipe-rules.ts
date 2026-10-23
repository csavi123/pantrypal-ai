// Code-side checks for model output. Nothing the model says about pantry status,
// diets or timing is trusted; everything is recomputed here.

export type Ingredient = { name: string; quantity: number | null; unit: string | null };
// pantry_shortfall: set when the recipe needs more than the user entered, e.g. "have 2".
// is_staple: salt, pepper, oil or water the user didn't enter. Neither "in pantry" nor "missing".
export type RecipeIngredient = Ingredient & {
  in_pantry: boolean;
  pantry_shortfall: string | null;
  is_staple: boolean;
};
export type Nutrition = {
  calories_kcal: number | null;
  protein_g: number | null;
  is_estimate: true;
  source: string;
  unavailable_items: string[];
  protein_note: string | null;
};
export type Recipe = {
  title: string;
  cuisine: string;
  cook_time_minutes: number;
  servings: number;
  ingredients: RecipeIngredient[];
  missing_ingredients: string[];
  steps: string[];
  substitutions: { ingredient: string; substitute: string }[];
  nutrition: Nutrition;
};

// Codes are safe to log; details go back to the model and into user-facing messages.
export type FailureCode = "DIET" | "TOO_LONG" | "STRUCTURE" | "PARSE" | "AI_ERROR";
export type Failure = { code: FailureCode; detail: string; diet?: string };

const MAX_RECIPE_INGREDIENTS = 25;

export type CheckContext = {
  pantry: Ingredient[];
  maxMinutes: number;
  diets: string[];
  cuisine: string;
};

// ---------- text normalization ----------

function singular(w: string): string {
  let s = w;
  if (s.length > 4 && s.endsWith("ies")) s = s.slice(0, -3) + "y";
  else if (/(ches|shes|xes|zes|sses|oes)$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s") && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  // chili/chilies, broccoli: fold trailing i into y so both spellings agree
  if (s.length > 3 && s.endsWith("i")) s = s.slice(0, -1) + "y";
  return s;
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(" ");
}

// Words that don't change what an ingredient is, so "2 large eggs" matches "Eggs".
const DESCRIPTORS = new Set(
  [
    "fresh",
    "freshly",
    "large",
    "small",
    "medium",
    "chopped",
    "diced",
    "minced",
    "sliced",
    "grated",
    "shredded",
    "crushed",
    "ground",
    "boneless",
    "skinless",
    "raw",
    "cooked",
    "uncooked",
    "whole",
    "ripe",
    "firm",
    "extra",
    "organic",
    "frozen",
    "dried",
    "peeled",
    "halved",
    "cubed",
    "beaten",
    "finely",
    "roughly",
    "thinly",
    "optional",
    "lean",
    "a",
    "an",
    "of",
    "the",
    "to",
    "taste",
    "cup",
    "tbsp",
    "tsp",
    "tablespoon",
    "teaspoon",
    "g",
    "gram",
    "kg",
    "ml",
    "l",
    "oz",
    "lb",
    "pound",
    "clove",
    "pinch",
    "handful",
    "can",
    "tin",
    "jar",
    "piece",
    "canned",
    "tinned",
    "drained",
    "rinsed",
    "soaked",
    "thawed",
    "trimmed",
  ].map(singular),
);

export function pantryKey(name: string): string {
  // Drop parentheticals like "(400g)" and any token with a digit ("400g", "2").
  return normalize(name.replace(/\([^)]*\)/g, " "))
    .split(" ")
    .filter((w) => w && !DESCRIPTORS.has(w) && !/\d/.test(w))
    .join(" ");
}

const STAPLES = new Set(
  [
    "salt",
    "sea salt",
    "kosher salt",
    "table salt",
    "pepper",
    "black pepper",
    "salt and pepper",
    "oil",
    "olive oil",
    "vegetable oil",
    "canola oil",
    "cooking oil",
    "sunflower oil",
    "neutral oil",
    "water",
  ].map(pantryKey),
);

// ---------- dietary rules ----------

type DietRule = { block: string[]; allow: string[]; freeFrom: string[] };

const MEAT = [
  "chicken",
  "beef",
  "pork",
  "lamb",
  "mutton",
  "goat",
  "veal",
  "turkey",
  "duck",
  "goose",
  "venison",
  "bacon",
  "ham",
  "sausage",
  "salami",
  "pepperoni",
  "prosciutto",
  "pancetta",
  "chorizo",
  "steak",
  "meat",
  "mince",
  "meatball",
  "jerky",
  "bone broth",
  "gelatin",
  "gelatine",
  "lard",
  "suet",
  "tallow",
  "rennet",
];
const SEAFOOD = [
  "fish",
  "salmon",
  "tuna",
  "cod",
  "tilapia",
  "halibut",
  "trout",
  "mackerel",
  "sardine",
  "anchovy",
  "shrimp",
  "prawn",
  "crab",
  "lobster",
  "clam",
  "mussel",
  "oyster",
  "scallop",
  "squid",
  "calamari",
  "octopus",
  "fish sauce",
  "oyster sauce",
  "worcestershire",
  "dashi",
  "bonito",
  "caviar",
  "roe",
];
const DAIRY = [
  "milk",
  "cheese",
  "butter",
  "cream",
  "yogurt",
  "yoghurt",
  "ghee",
  "paneer",
  "whey",
  "casein",
  "buttermilk",
  "curd",
  "kefir",
  "labneh",
  "mozzarella",
  "parmesan",
  "parmigiano",
  "cheddar",
  "feta",
  "ricotta",
  "halloumi",
  "mascarpone",
  "brie",
  "gouda",
  "custard",
];
const DAIRY_ALLOW = [
  "coconut milk",
  "almond milk",
  "oat milk",
  "soy milk",
  "rice milk",
  "cashew milk",
  "coconut cream",
  "coconut yogurt",
  "soy yogurt",
  "oat cream",
  "peanut butter",
  "almond butter",
  "cashew butter",
  "nut butter",
  "seed butter",
  "sunflower seed butter",
  "cocoa butter",
  "apple butter",
  "bean curd",
  "cream of tartar",
  "butter bean",
];
const EGG = ["egg", "mayonnaise", "mayo", "meringue", "aioli"];
const EGG_ALLOW = ["flax egg", "chia egg"];
const GLUTEN = [
  "wheat",
  "flour",
  "pasta",
  "spaghetti",
  "penne",
  "macaroni",
  "fettuccine",
  "linguine",
  "lasagna",
  "orzo",
  "noodle",
  "bread",
  "breadcrumb",
  "panko",
  "crouton",
  "couscous",
  "bulgur",
  "barley",
  "rye",
  "semolina",
  "seitan",
  "farro",
  "spelt",
  "soy sauce",
  "teriyaki",
  "hoisin",
  "tortilla",
  "cracker",
  "naan",
  "roti",
  "chapati",
  "pita",
  "bun",
  "bagel",
  "pastry",
  "gnocchi",
  "wonton",
  "udon",
  "ramen",
  "malt",
  "beer",
];
const GLUTEN_ALLOW = [
  "rice flour",
  "almond flour",
  "coconut flour",
  "chickpea flour",
  "gram flour",
  "corn flour",
  "tapioca flour",
  "buckwheat flour",
  "potato flour",
  "rice noodle",
  "glass noodle",
  "shirataki noodle",
  "zucchini noodle",
  "corn tortilla",
  "rice paper",
  "rice cracker",
  "tamari",
  "coconut aminos",
];
const NUTS = [
  "nut",
  "peanut",
  "almond",
  "cashew",
  "walnut",
  "pecan",
  "pistachio",
  "hazelnut",
  "macadamia",
  "praline",
  "marzipan",
  "nutella",
  "satay",
  "pesto",
];
const HALAL = [
  "pork",
  "bacon",
  "ham",
  "lard",
  "gelatin",
  "gelatine",
  "prosciutto",
  "pancetta",
  "salami",
  "pepperoni",
  "chorizo",
  "wine",
  "beer",
  "rum",
  "brandy",
  "vodka",
  "whiskey",
  "sake",
  "mirin",
  "alcohol",
  "liqueur",
];
const MEAT_FREE_PREFIXES = ["vegan", "vegetarian", "plant based", "meatless", "veggie"];

const RULES: Record<string, DietRule> = {
  vegetarian: {
    block: [...MEAT, ...SEAFOOD],
    allow: ["oyster mushroom"],
    freeFrom: MEAT_FREE_PREFIXES,
  },
  vegan: {
    block: [...MEAT, ...SEAFOOD, ...DAIRY, ...EGG, "honey"],
    allow: ["oyster mushroom", ...DAIRY_ALLOW, ...EGG_ALLOW],
    freeFrom: ["vegan", "plant based", "dairy free", "egg free"],
  },
  "gluten-free": { block: GLUTEN, allow: GLUTEN_ALLOW, freeFrom: ["gluten free"] },
  "dairy-free": {
    block: DAIRY,
    allow: DAIRY_ALLOW,
    freeFrom: ["dairy free", "vegan", "plant based"],
  },
  "nut-free": { block: NUTS, allow: [], freeFrom: ["nut free"] },
  "egg-free": { block: EGG, allow: EGG_ALLOW, freeFrom: ["egg free", "vegan"] },
  halal: {
    block: HALAL,
    allow: ["turkey bacon", "beef bacon", "wine vinegar"],
    freeFrom: ["halal"],
  },
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Pre-normalize every term the same way as recipe text, longest allow-phrases first.
const COMPILED = Object.fromEntries(
  Object.entries(RULES).map(([diet, r]) => [
    diet,
    {
      block: r.block.map(normalize),
      allow: r.allow.map(normalize).sort((a, b) => b.length - a.length),
      freeFrom: r.freeFrom.map(normalize),
    },
  ]),
);

/** Blocked terms found in `text` for `diet`. Explicitly free-from items ("gluten-free pasta") are exempt. */
export function dietHits(text: string, diet: string): string[] {
  const rule = COMPILED[diet];
  if (!rule) return [];
  let t = ` ${normalize(text)} `;
  for (const p of rule.freeFrom)
    t = t.replace(new RegExp(` ${escapeRe(p)}(?: [^ ]+){1,2}(?= )`, "g"), "");
  for (const a of rule.allow) t = t.replace(new RegExp(` ${escapeRe(a)}(?= )`, "g"), "");
  return rule.block.filter((b) => t.includes(` ${b} `));
}

// ---------- recipe validation ----------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export type CheckResult =
  { ok: true; recipe: Recipe } | { ok: false; title: string; failures: Failure[] };

export function checkRecipe(raw: unknown, ctx: CheckContext): CheckResult {
  const r = isObject(raw) ? raw : {};
  const title = str(r["title"]);
  const label = title || "Untitled recipe";
  const failures: Failure[] = [];

  if (!title) failures.push({ code: "STRUCTURE", detail: "missing a title" });

  const steps = Array.isArray(r["steps"]) ? r["steps"].map(str).filter(Boolean) : [];
  if (!steps.length) failures.push({ code: "STRUCTURE", detail: "has no steps" });

  const rawIngredients = Array.isArray(r["ingredients"]) ? r["ingredients"].filter(isObject) : [];
  const userKeys = new Set(ctx.pantry.map((i) => pantryKey(i.name)).filter(Boolean));
  const ingredients: RecipeIngredient[] = rawIngredients
    .map((i) => {
      const name = str(i["name"]);
      const q = i["quantity"];
      const key = pantryKey(name);
      const inPantry = key !== "" && userKeys.has(key);
      return {
        name,
        quantity: typeof q === "number" && Number.isFinite(q) && q >= 0 ? q : null,
        unit: str(i["unit"]) || null,
        // Recomputed: only what the user entered counts as in the pantry.
        in_pantry: inPantry,
        pantry_shortfall: null,
        is_staple: !inPantry && STAPLES.has(key),
      };
    })
    .filter((i) => i.name);
  if (!ingredients.length) failures.push({ code: "STRUCTURE", detail: "has no ingredients" });
  // Caps USDA lookups per request; real recipes stay well under this.
  else if (ingredients.length > MAX_RECIPE_INGREDIENTS) {
    failures.push({
      code: "STRUCTURE",
      detail: `has more than ${MAX_RECIPE_INGREDIENTS} ingredients`,
    });
  }

  const minutes = r["cook_time_minutes"];
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) {
    failures.push({ code: "STRUCTURE", detail: "has no valid cook_time_minutes" });
  } else if (minutes > ctx.maxMinutes) {
    failures.push({
      code: "TOO_LONG",
      detail: `takes ${minutes} minutes but the limit is ${ctx.maxMinutes}`,
    });
  }

  const servings = r["servings"];
  if (typeof servings !== "number" || !Number.isInteger(servings) || servings < 1) {
    failures.push({ code: "STRUCTURE", detail: "has no valid servings count" });
  }

  const substitutions = (
    Array.isArray(r["substitutions"]) ? r["substitutions"].filter(isObject) : []
  )
    .map((s) => ({ ingredient: str(s["ingredient"]), substitute: str(s["substitute"]) }))
    .filter((s) => s.ingredient && s.substitute);

  const dietTexts = [
    ...ingredients.map((i) => i.name),
    ...substitutions.flatMap((s) => [s.ingredient, s.substitute]),
    ...steps,
  ];
  for (const diet of ctx.diets) {
    const hits = [...new Set(dietTexts.flatMap((t) => dietHits(t, diet)))];
    if (hits.length)
      failures.push({ code: "DIET", diet, detail: `is not ${diet} (contains ${hits.join(", ")})` });
  }

  if (failures.length) return { ok: false, title: label, failures };

  // Basic staples are assumed on hand, so they are not listed as missing.
  const missing = ingredients.filter((i) => !i.in_pantry && !i.is_staple).map((i) => i.name);

  return {
    ok: true,
    recipe: {
      title,
      cuisine: str(r["cuisine"]) || (ctx.cuisine === "Any" ? "" : ctx.cuisine),
      cook_time_minutes: minutes as number,
      servings: servings as number,
      ingredients,
      missing_ingredients: missing,
      steps,
      substitutions,
      // Any model-provided nutrition is ignored; addNutrition() fills this from USDA data.
      nutrition: {
        calories_kcal: null,
        protein_g: null,
        is_estimate: true,
        source: "pending",
        unavailable_items: [],
        protein_note: null,
      },
    },
  };
}

/** Plain-English reason shown to the user when no recipe passed. */
export function noRecipeMessage(failures: Failure[], maxMinutes: number): string {
  const diets = [...new Set(failures.filter((f) => f.code === "DIET").map((f) => f.diet!))];
  const tooLong = failures.some((f) => f.code === "TOO_LONG");
  if (!diets.length && !tooLong) {
    return "The recipe service didn't return a complete recipe after 3 tries. Please try again.";
  }
  const kind = diets.length ? `${diets.join(" and ")} recipe` : "recipe";
  const article = /^[aeiou]/.test(kind) ? "an" : "a";
  const time = tooLong ? ` under ${maxMinutes} minutes` : "";
  const tip = tooLong
    ? "Try adding more ingredients or allowing more time."
    : "Try adding more ingredients.";
  return `Couldn't make ${article} ${kind}${time} from these ingredients. ${tip}`;
}
