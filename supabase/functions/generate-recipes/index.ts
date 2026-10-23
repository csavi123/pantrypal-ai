import { createClient } from "npm:@supabase/supabase-js@2";
import { callModel, parseJsonObject, readAiConfig, type AiConfig, type ChatMessage } from "./ai.ts";
import {
  initialPrompt,
  MAX_RECIPES,
  retryPrompt,
  SYSTEM_PROMPT,
  unreadablePrompt,
  type FeedbackItem,
  type PromptInput,
} from "./prompt.ts";
import { addNutrition } from "./nutrition.ts";
import { markShortages } from "./pantry-amounts.ts";
import {
  checkRecipe,
  noRecipeMessage,
  type Failure,
  type Ingredient,
  type Recipe,
} from "./recipe-rules.ts";

// Keep in sync with src/lib/pantry.ts (COOK_TIMES, CUISINES, DIETS).
const COOK_TIMES = [15, 30, 45, 60];
const CUISINES = ["Any", "Indian", "Italian", "Mexican", "Mediterranean", "Asian", "American"];
const DIETS = ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "egg-free", "halal"];
const MAX_INGREDIENTS = 30;
const MAX_NAME_LENGTH = 60;
const DEFAULT_DAILY_LIMIT = 5;
const MAX_ATTEMPTS = 3; // first try + 2 retries
const FEEDBACK_REASON_MAX = 300;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-region, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Preferences = {
  max_cook_time_minutes: number;
  cuisine: string;
  dietary_restrictions: string[];
  protein_goal_g: number | null;
  recipe_count: number;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(status: number, code: string, message: string, fields?: Record<string, string>) {
  return json(status, { error: { code, message, ...(fields ? { fields } : {}) } });
}

function dailyLimit() {
  const n = Number(Deno.env.get("DAILY_GENERATION_LIMIT"));
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

type Validated =
  | { ok: true; ingredients: Ingredient[]; preferences: Preferences }
  | { ok: false; response: Response };

function validate(body: unknown): Validated {
  const fields: Record<string, string> = {};
  const raw = isObject(body) ? body : {};

  if (
    raw["ingredients"] === undefined ||
    (Array.isArray(raw["ingredients"]) && raw["ingredients"].length === 0)
  ) {
    return { ok: false, response: fail(400, "NO_INGREDIENTS", "Add at least one ingredient.") };
  }

  const ingredients: Ingredient[] = [];
  if (!Array.isArray(raw["ingredients"])) {
    fields["ingredients"] = "Ingredients must be a list.";
  } else if (raw["ingredients"].length > MAX_INGREDIENTS) {
    fields["ingredients"] = `Use at most ${MAX_INGREDIENTS} ingredients.`;
  } else {
    raw["ingredients"].forEach((item: unknown, i: number) => {
      const it = isObject(item) ? item : {};
      const name = typeof it["name"] === "string" ? it["name"].trim() : "";
      if (!name) fields[`ingredients[${i}].name`] = "Ingredient name can't be empty.";
      else if (name.length > MAX_NAME_LENGTH)
        fields[`ingredients[${i}].name`] =
          `Ingredient name must be ${MAX_NAME_LENGTH} characters or fewer.`;

      const q = it["quantity"];
      let quantity: number | null = null;
      if (q !== null && q !== undefined) {
        if (typeof q !== "number" || !Number.isFinite(q))
          fields[`ingredients[${i}].quantity`] = "Quantity must be a number.";
        else if (q < 0) fields[`ingredients[${i}].quantity`] = "Quantity can't be negative.";
        else quantity = q;
      }

      const u = it["unit"];
      let unit: string | null = null;
      if (u !== null && u !== undefined) {
        if (typeof u !== "string") fields[`ingredients[${i}].unit`] = "Unit must be text.";
        else unit = u.trim() || null;
      }

      ingredients.push({ name, quantity, unit });
    });
  }

  const p = isObject(raw["preferences"]) ? raw["preferences"] : {};

  const time = p["max_cook_time_minutes"];
  if (typeof time !== "number" || !COOK_TIMES.includes(time)) {
    fields["preferences.max_cook_time_minutes"] =
      `Max cook time must be one of ${COOK_TIMES.join(", ")} minutes.`;
  }

  const cuisine = p["cuisine"];
  if (typeof cuisine !== "string" || !CUISINES.includes(cuisine)) {
    fields["preferences.cuisine"] = `Cuisine must be one of: ${CUISINES.join(", ")}.`;
  }

  const diets = p["dietary_restrictions"] ?? [];
  if (!Array.isArray(diets)) {
    fields["preferences.dietary_restrictions"] = "Dietary restrictions must be a list.";
  } else {
    const unknown = diets.filter((d) => typeof d !== "string" || !DIETS.includes(d));
    if (unknown.length)
      fields["preferences.dietary_restrictions"] =
        `Unknown dietary restriction(s): ${unknown.map(String).join(", ")}.`;
  }

  const protein = p["protein_goal_g"];
  if (
    protein !== null &&
    protein !== undefined &&
    (typeof protein !== "number" || !Number.isFinite(protein) || protein < 0 || protein > 300)
  ) {
    fields["preferences.protein_goal_g"] = "Protein target must be a number between 0 and 300.";
  }

  // Optional; defaults to the maximum.
  const recipeCount = p["recipe_count"] ?? MAX_RECIPES;
  if (
    typeof recipeCount !== "number" ||
    !Number.isInteger(recipeCount) ||
    recipeCount < 1 ||
    recipeCount > MAX_RECIPES
  ) {
    fields["preferences.recipe_count"] = `Number of recipes must be between 1 and ${MAX_RECIPES}.`;
  }

  if (Object.keys(fields).length) {
    return {
      ok: false,
      response: fail(400, "INVALID_INPUT", Object.values(fields).join(" "), fields),
    };
  }

  return {
    ok: true,
    ingredients,
    preferences: {
      max_cook_time_minutes: time as number,
      cuisine: cuisine as string,
      dietary_restrictions: diets as string[],
      protein_goal_g: (protein as number | null | undefined) ?? null,
      recipe_count: recipeCount as number,
    },
  };
}

type GenerateResult =
  | { ok: true; recipes: Recipe[]; shortfall: boolean }
  | { ok: false; failures: Failure[]; gotReply: boolean };

/**
 * Ask the model, check every recipe in code, and send failures back for replacements.
 * At most MAX_ATTEMPTS model calls; recipes that still fail are dropped.
 */
async function generate(
  cfg: AiConfig,
  input: PromptInput,
  userId: string,
): Promise<GenerateResult> {
  const ctx = {
    pantry: input.pantry,
    maxMinutes: input.maxMinutes,
    diets: input.diets,
    cuisine: input.cuisine,
  };
  const messages: ChatMessage[] = [{ role: "user", content: initialPrompt(input) }];
  const accepted: Recipe[] = [];
  const allFailures: Failure[] = [];
  let wanted = input.count;
  let gotReply = false;
  let attempt = 0;

  while (attempt < MAX_ATTEMPTS && wanted > 0) {
    attempt++;
    let reply;
    try {
      reply = await callModel(cfg, SYSTEM_PROMPT, messages);
    } catch (e) {
      // Provider error text has no user data; the same messages are retried.
      console.log(
        JSON.stringify({
          event: "generate_attempt",
          user_id: userId,
          attempt,
          error: "AI_ERROR",
          reason: String((e as Error).message).slice(0, 200),
        }),
      );
      allFailures.push({ code: "AI_ERROR", detail: "the recipe service did not respond" });
      continue;
    }
    gotReply = true;

    const parsed = parseJsonObject(reply.text);
    const raw =
      parsed && Array.isArray(parsed["recipes"]) ? (parsed["recipes"] as unknown[]) : null;
    if (!raw || !raw.length) {
      console.log(
        JSON.stringify({
          event: "generate_attempt",
          user_id: userId,
          attempt,
          error: "PARSE",
          truncated: reply.truncated,
        }),
      );
      allFailures.push({ code: "PARSE", detail: "unreadable response" });
      messages.push(
        { role: "assistant", content: reply.text || "(empty)" },
        { role: "user", content: unreadablePrompt(reply.truncated, wanted) },
      );
      continue;
    }

    const rejected: { title: string; failures: Failure[] }[] = [];
    for (const item of raw.slice(0, wanted)) {
      const result = checkRecipe(item, ctx);
      if (result.ok) {
        const dupe = accepted.some(
          (a) => a.title.toLowerCase() === result.recipe.title.toLowerCase(),
        );
        if (!dupe) accepted.push(result.recipe);
      } else {
        rejected.push(result);
        allFailures.push(...result.failures);
      }
    }
    console.log(
      JSON.stringify({
        event: "generate_attempt",
        user_id: userId,
        attempt,
        received: raw.length,
        accepted_total: accepted.length,
        rejected: rejected.map((r) => r.failures.map((f) => f.code)),
      }),
    );

    if (!rejected.length) break;
    wanted = Math.min(rejected.length, input.count - accepted.length);
    if (attempt === MAX_ATTEMPTS || wanted <= 0) break;
    messages.push(
      { role: "assistant", content: reply.text },
      {
        role: "user",
        content: retryPrompt(
          rejected,
          accepted.map((a) => a.title),
          wanted,
        ),
      },
    );
  }

  console.log(
    JSON.stringify({
      event: "generate_done",
      user_id: userId,
      attempts: attempt,
      recipes: accepted.length,
    }),
  );
  // Fewer than asked for because something failed (not because the model chose to return fewer).
  const shortfall = allFailures.length > 0 && accepted.length < input.count;
  return accepted.length
    ? { ok: true, recipes: accepted, shortfall }
    : { ok: false, failures: allFailures, gotReply };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "Use POST.");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  // 1. Auth
  const token = req.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return fail(401, "UNAUTHORIZED", "Please log in to generate recipes.");
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user)
    return fail(401, "UNAUTHORIZED", "Please log in to generate recipes.");
  const userId = userData.user.id;

  // 2. Validation
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "INVALID_INPUT", "Request body must be valid JSON.");
  }
  const v = validate(body);
  if (!v.ok) return v.response;

  // Check AI config before spending a daily generation on a request that can't run.
  const cfg = readAiConfig();
  if ("error" in cfg) {
    console.error("AI not configured:", cfg.error);
    return fail(
      500,
      "AI_NOT_CONFIGURED",
      "Recipe generation isn't set up yet. Please try again later.",
    );
  }

  // Profile and recent feedback. The admin client bypasses RLS, so filter by user explicitly.
  const [profileRes, feedbackRes] = await Promise.all([
    admin
      .from("profiles")
      .select("dietary_restrictions, protein_goal_g")
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("recipe_feedback")
      .select("rating, reason, recipes(title)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  if (profileRes.error) {
    console.error("profile load failed", profileRes.error.code);
    return fail(500, "INTERNAL", "Couldn't load your profile. Please try again.");
  }
  if (feedbackRes.error) console.error("feedback load failed", feedbackRes.error.code);

  // Saved restrictions always apply, on top of any chosen for this request.
  const savedDiets: string[] = (profileRes.data?.dietary_restrictions ?? []).filter((d: string) =>
    DIETS.includes(d),
  );
  const diets = [...new Set([...v.preferences.dietary_restrictions, ...savedDiets])];

  const feedback: FeedbackItem[] = (feedbackRes.data ?? []).flatMap((f) => {
    const rec = Array.isArray(f.recipes) ? f.recipes[0] : f.recipes;
    const title = typeof rec?.title === "string" ? rec.title : "";
    if (!title || (f.rating !== "helpful" && f.rating !== "unhelpful")) return [];
    const reason =
      typeof f.reason === "string" && f.reason.trim()
        ? f.reason.trim().slice(0, FEEDBACK_REASON_MAX)
        : null;
    return [{ title, rating: f.rating, reason }];
  });

  // 3. Daily limit: counted once per request, so internal retries won't consume extra.
  const limit = dailyLimit();
  const { data: count, error: usageErr } = await admin.rpc("consume_generation", {
    p_user: userId,
    p_limit: limit,
  });
  if (usageErr) {
    if (usageErr.message?.includes("DAILY_LIMIT_REACHED")) {
      return fail(
        429,
        "DAILY_LIMIT_REACHED",
        `You've used all ${limit} recipe generations for today. Come back tomorrow.`,
      );
    }
    console.error("consume_generation failed", usageErr);
    return fail(500, "INTERNAL", "Couldn't check your daily generation limit. Please try again.");
  }
  const remaining = Math.max(0, limit - Number(count));

  // 4. Generate (retries inside do not consume more generations).
  const proteinGoal = v.preferences.protein_goal_g ?? profileRes.data?.protein_goal_g ?? null;
  const result = await generate(
    cfg,
    {
      pantry: v.ingredients,
      maxMinutes: v.preferences.max_cook_time_minutes,
      cuisine: v.preferences.cuisine,
      diets,
      proteinGoal,
      feedback,
      count: v.preferences.recipe_count,
    },
    userId,
  );

  if (!result.ok) {
    if (!result.gotReply) {
      return fail(
        502,
        "AI_UNAVAILABLE",
        "The recipe service isn't responding right now. Please try again in a few minutes.",
      );
    }
    return fail(
      422,
      "NO_VALID_RECIPE",
      noRecipeMessage(result.failures, v.preferences.max_cook_time_minutes),
    );
  }

  // 5. Nutrition from USDA. Never fails the request; missing data is reported per recipe.
  // Pantry items used beyond the amount the user entered are flagged "need more".
  const recipes = await addNutrition(
    markShortages(result.recipes, v.ingredients),
    Deno.env.get("USDA_API_KEY")?.trim(),
    proteinGoal,
    userId,
  );

  const n = recipes.length;
  return json(200, {
    recipes,
    remaining_generations_today: remaining,
    daily_limit: limit,
    message: result.shortfall
      ? `Only ${n} recipe${n === 1 ? "" : "s"} met all your requirements.`
      : null,
  });
});
