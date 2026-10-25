# PantryPal AI

PantryPal AI helps busy people prepare healthy, protein-rich meals using the ingredients they have, the time they can spare, and the foods they actually enjoy.

Healthy, protein-rich recipes from what's already in your kitchen. Enter your ingredients, cooking time, cuisine and dietary restrictions, and PantryPal suggests 1 to 3 recipes with steps, substitutions, pantry status and estimated nutrition.

> PantryPal offers cooking ideas, not medical or dietary advice. Nutrition values are estimates.

## Features

- **Kitchen**: add ingredients (quantity and unit optional), pick cook time, cuisine, diets, protein target and how many recipes (1–3). Inputs are validated as you type, and you can save your choices as defaults.
- **Recipe checks in code**: every AI recipe is verified before it is shown:
  - dietary restrictions (ingredients, substitutions and steps);
  - cook time within your limit;
  - complete structure;
  - with **Only use my ingredients** on (the default), no required ingredient beyond your list and basic staples.
  
  Recipes that fail are sent back for replacements, at most 2 retries.
- **Honest pantry badges**:
  - **In your pantry**: only ingredients you entered;
  - **Need more (have 2)**: when a recipe uses more than you have;
  - **Basic staple**: salt, pepper, oil, butter, garlic and water;
  - **Optional**: extras the recipe works without;
  - **Missing**: everything else (only possible with "Only use my ingredients" off).
- **Nutrition**: calories and protein per serving from USDA FoodData Central, always labeled as an estimate. Ingredients without reference data are listed rather than guessed.
- **Feedback loop**: rate recipes helpful or not helpful (with an optional reason). Your recent feedback shapes future suggestions.
- **Daily limit**: 5 generations per user per day (configurable). Retries never count extra.

## Tech stack

| Layer | Tools |
| --- | --- |
| Frontend | TanStack Start (React), TypeScript, Tailwind CSS v4, shadcn/ui |
| Backend | Supabase: Auth, Postgres with row-level security, Edge Function (Deno) |
| AI | Anthropic (default `claude-haiku-5-5`); OpenAI and Gemini also supported |
| Nutrition | USDA FoodData Central API |
| Hosting | Lovable (synced with this repo's `main` branch) |

## How it works

```
Browser ──(Supabase client + RLS)──▶ Postgres: profiles, recipes, recipe_feedback, generation_usage
   │
   └──(functions.invoke, user JWT)──▶ Edge Function `generate-recipes`
                                        1. verify login
                                        2. validate input
                                        3. charge 1 daily generation (atomic, in SQL)
                                        4. call the AI, check every recipe, retry failures (≤ 3 calls)
                                        5. add USDA nutrition and "need more" flags
                                        6. return recipes + remaining generations
```

All secrets stay in the edge function. The browser only ever has the public Supabase URL and publishable key.

## Project structure

```
src/
  routes/
    index.tsx                    landing page
    auth.tsx                     log in / sign up
    _authenticated/              signed-in pages (kitchen, results, recipes/$id, history, preferences)
  components/                    ErrorBanner, Footer (disclaimer), PreferenceFields, ui/ (shadcn)
  lib/pantry.ts                  shared constants, types, edge-function error parsing
  lib/queries.ts                 Supabase queries (profile, usage, history, recipes)
  integrations/supabase/         generated Supabase client and types (do not edit)
supabase/
  functions/generate-recipes/
    index.ts                     request handling, auth, validation, daily limit, retry loop
    ai.ts                        Anthropic / OpenAI / Gemini calls (fetch, 25 s timeout)
    prompt.ts                    system prompt, request and retry prompts
    recipe-rules.ts              pantry matching, diet keyword rules, recipe checks
    nutrition.ts                 USDA lookup (5 s timeout), unit conversion, per-serving totals
    pantry-amounts.ts            "need more" check against entered quantities
  migrations/                    database schema, RLS, consume_generation(), hardening
```

## Running locally

Requires Node.js 20+ and npm.

```sh
npm install
npm run dev          # starts the app; open the URL it prints (usually http://localhost:8080)
```

The app talks to the Supabase project in `.env` (public URL and publishable key only). Recipe generation runs in the deployed edge function, so deploy it before testing generation locally (see below).

| Command | What it does |
| --- | --- |
| `npm run dev` | Local development server |
| `npm run build` | Production build (run before pushing) |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |

## Supabase setup

### Secrets (edge function only)

```sh
npx supabase secrets set AI_PROVIDER=anthropic AI_API_KEY=<key> USDA_API_KEY=<key>
```

| Secret | Required | Default | Notes |
| --- | --- | --- | --- |
| `AI_PROVIDER` | no | `anthropic` | `anthropic`, `openai` or `gemini` |
| `AI_API_KEY` | yes | – | Key for the chosen provider |
| `AI_MODEL` | for openai/gemini | `claude-haiku-5-5` (anthropic) | Model ID |
| `USDA_API_KEY` | recommended | – | Free at https://fdc.nal.usda.gov/api-key-signup; without it nutrition shows "unavailable" |
| `DAILY_GENERATION_LIMIT` | no | `5` | Generations per user per UTC day |

Never put secrets in `.env`; use Supabase secrets, or `.env.local` (git-ignored) for local-only values.

### Database and function

```sh
npx supabase db push                                # apply migrations in supabase/migrations
npx supabase functions deploy generate-recipes      # uses supabase/config.toml (verify_jwt = false; the function checks auth itself)
```

### Auth URLs

In Supabase → Authentication → URL Configuration, set the **Site URL** to your published address and add `https://<your-app>.lovable.app/**` and `http://localhost:8080/**` to **Redirect URLs**.

## Edge function API

`POST /functions/v1/generate-recipes` with the user's session token (sent automatically by `supabase.functions.invoke`).

```json
{
  "ingredients": [{ "name": "Eggs", "quantity": 2, "unit": null }],
  "preferences": {
    "max_cook_time_minutes": 30,
    "cuisine": "Any",
    "dietary_restrictions": ["vegetarian"],
    "protein_goal_g": 30,
    "recipe_count": 2,
    "pantry_only": true
  }
}
```

**Success (200):** `{ recipes: [...], remaining_generations_today, daily_limit, message }`

**Errors:** `{ error: { code, message, fields? } }`

| Status | Code | When |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | Missing or invalid login |
| 400 | `NO_INGREDIENTS` | Empty ingredient list |
| 400 | `INVALID_INPUT` | Field-level problems, listed in `fields` |
| 429 | `DAILY_LIMIT_REACHED` | Daily generations used up |
| 422 | `NO_VALID_RECIPE` | No recipe passed the checks after 3 attempts; the message explains which requirement failed |
| 502 | `AI_UNAVAILABLE` | The AI provider didn't respond |
| 500 | `AI_NOT_CONFIGURED` / `INTERNAL` | Missing secrets or an unexpected server error |

Validation and configuration errors are returned before a daily generation is used.

## Security

- Row-level security on every table; users can only read and write their own rows.
- `generation_usage` is read-only for users. It is updated only by the service-role `consume_generation()` function, atomically, so the limit can't be raced or skipped.
- AI and USDA keys exist only as Supabase secrets.
- AI calls time out after 25 s and USDA lookups after 5 s. There are at most 3 AI calls per request, and the AI may return at most 25 ingredients per recipe.
- Logs record user IDs, attempt counts and failure codes only, never ingredients or feedback text.

### Before a public launch

- Set a spend limit (or keep prepaid credits with auto-reload off) in the Anthropic Console.
- Connect a custom SMTP provider in Supabase so sign-up emails aren't throttled.
- Consider CAPTCHA on sign-up (Supabase → Authentication → Attack Protection).
- Update the Auth URL configuration for the published domain.

## Working with Lovable

This project is connected to [Lovable](https://lovable.dev/projects/270af0a7-ea9e-48cd-8d8f-c9f2189857f0). Commits pushed to `main` sync to the Lovable editor and changes made in Lovable are committed here, so:

- keep `main` building (`npm run build`) before pushing;
- don't rewrite pushed history (no force-push, rebase or amend of pushed commits).

Contributor and agent conventions are in `AGENTS.md` and `CLAUDE.md`.
