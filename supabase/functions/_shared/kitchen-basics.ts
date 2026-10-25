// Single source of truth for which ingredients are assumed to be in every kitchen,
// and which main ingredients the Kitchen page offers as quick-add chips.
// Imported by the app (src/lib/pantry.ts) and by the generate-recipes edge function,
// so it must stay plain TypeScript with no imports.

/** Everyday basics, always treated as available. */
export const KITCHEN_BASICS = [
  "onion",
  "red onion",
  "garlic",
  "garlic clove",
  "ginger",
  "tomato",
  "cherry tomato",
  "tomato paste",
  "tomato puree",
  "green chili",
  "green chilli",
  "lemon",
  "lemon juice",
  "oil",
  "olive oil",
  "vegetable oil",
  "canola oil",
  "sunflower oil",
  "cooking oil",
  "neutral oil",
  "cooking spray",
  "butter",
  "ghee",
  "salt",
  "sea salt",
  "kosher salt",
  "table salt",
  "pepper",
  "black pepper",
  "salt and pepper",
  "sugar",
  "water",
];

/** Common dried spices and herbs, always treated as available. */
export const COMMON_SPICES = [
  "cumin",
  "cumin seed",
  "ground cumin",
  "turmeric",
  "chili powder",
  "red chili powder",
  "chili flake",
  "red pepper flake",
  "cayenne",
  "paprika",
  "smoked paprika",
  "garam masala",
  "curry powder",
  "coriander powder",
  "ground coriander",
  "mustard seed",
  "fennel seed",
  "fenugreek",
  "asafoetida",
  "hing",
  "cardamom",
  "cinnamon",
  "clove",
  "nutmeg",
  "bay leaf",
  "bay leaves",
  "oregano",
  "dried oregano",
  "basil",
  "dried basil",
  "thyme",
  "rosemary",
  "italian seasoning",
  "mixed herbs",
  "garlic powder",
  "onion powder",
];

/** Quick-add chips: proteins, grains, legumes, vegetables and dairy. */
export const MAIN_INGREDIENTS = [
  "Eggs",
  "Chicken breast",
  "Paneer",
  "Tofu",
  "Greek yogurt",
  "Lentils",
  "Chickpeas",
  "Rice",
  "Quinoa",
  "Spinach",
  "Broccoli",
  "Mushrooms",
];

const QUALIFIERS = new Set([
  "fresh",
  "chopped",
  "minced",
  "diced",
  "sliced",
  "crushed",
  "whole",
  "large",
  "small",
  "medium",
  "extra",
  "virgin",
  "unsalted",
  "salted",
  "dry",
  "dried",
  "ground",
  "powdered",
  "some",
  "a",
  "of",
  "inch",
  "piece",
  "pinch",
  "handful",
  "tsp",
  "tbsp",
  "teaspoon",
  "tablespoon",
  "cup",
  "g",
  "ml",
]);

const singular = (w: string) =>
  /(oes|ies)$/.test(w) ? w.slice(0, -2) : /[^s]s$/.test(w) ? w.slice(0, -1) : w;

/** Loose match key: lowercase, letters only, qualifiers dropped, each word singular. */
function basicKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !QUALIFIERS.has(w))
    .map(singular)
    .join(" ");
}

const ASSUMED_KEYS = new Set([...KITCHEN_BASICS, ...COMMON_SPICES].map(basicKey));

/** True for basics and spices the user never needs to enter ("Onions", "ground cumin"). */
export function isAssumedIngredient(name: string): boolean {
  const key = basicKey(name);
  return key !== "" && ASSUMED_KEYS.has(key);
}
