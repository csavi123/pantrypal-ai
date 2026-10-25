import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ErrorBanner } from "@/components/ErrorBanner";
import { PreferenceFields, validateProtein, type Prefs } from "@/components/PreferenceFields";
import {
  DAILY_LIMIT,
  isAssumedIngredient,
  MAX_INGREDIENTS,
  MAX_NAME_LENGTH,
  QUICK_ADD,
  RECIPES_PER_GENERATION,
  readFunctionError,
  type GenerateResponse,
} from "@/lib/pantry";
import { profileQuery, usageQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/kitchen")({
  head: () => ({
    meta: [
      { title: "Your kitchen — PantryPal AI" },
      { name: "description", content: "Add your ingredients and preferences to generate recipes." },
      { property: "og:title", content: "Your kitchen — PantryPal AI" },
      { property: "og:description", content: "Add your ingredients and preferences to generate recipes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Kitchen,
});

type Row = { key: number; name: string; quantity: string; unit: string };
type Banner = { message: string; details?: string[] };
let k = 0;
const newRow = (name = ""): Row => ({ key: ++k, name, quantity: "", unit: "" });

const GENERIC_ERROR = "Something went wrong. Please try again.";

/** Same limits the edge function enforces, checked as the user types. Keys: n<row>, q<row>, ingredients, protein. */
function validate(rows: Row[], prefs: Prefs) {
  const errors: Record<string, string> = {};
  // Only main ingredients count; basics and spices are always assumed.
  const filled = rows.filter((r) => r.name.trim() && !isAssumedIngredient(r.name));
  if (!filled.length) errors["ingredients"] = "Add at least one ingredient.";
  else if (filled.length > MAX_INGREDIENTS) errors["ingredients"] = `Use at most ${MAX_INGREDIENTS} ingredients.`;
  for (const r of rows) {
    const name = r.name.trim();
    if (!name && (r.quantity.trim() || r.unit.trim())) errors[`n${r.key}`] = "Add a name or clear this row.";
    else if (name.length > MAX_NAME_LENGTH) errors[`n${r.key}`] = `Keep names under ${MAX_NAME_LENGTH} characters.`;
    if (r.quantity.trim() && !(Number(r.quantity) > 0)) errors[`q${r.key}`] = "Use a positive number.";
  }
  const protein = validateProtein(prefs.protein_goal_g);
  if (protein) errors["protein"] = protein;
  return { errors, filled };
}

// Remembered per browser; the profile table has no column for it.
const PANTRY_ONLY_KEY = "pantrypal.pantryOnly";
function readPantryOnly() {
  try {
    return localStorage.getItem(PANTRY_ONLY_KEY) !== "false";
  } catch {
    return true;
  }
}

function Kitchen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useQuery(profileQuery);
  const { data: remaining } = useQuery(usageQuery);
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [prefs, setPrefs] = useState<Prefs>({ max_cook_time_minutes: 30, cuisine: "Any", dietary_restrictions: [], protein_goal_g: "" });
  const [prefilled, setPrefilled] = useState(false);
  const [saveDefaults, setSaveDefaults] = useState(false);
  const [pantryOnly, setPantryOnly] = useState(true);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  // Per row: "Onion is already assumed…", shown after a basic or spice is cleared from the field.
  const [assumedHints, setAssumedHints] = useState<Record<number, string>>({});
  const [banner, setBanner] = useState<Banner | null>(null);
  const [loading, setLoading] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [limit, setLimit] = useState(DAILY_LIMIT);

  useEffect(() => setPantryOnly(readPantryOnly()), []);

  function changePantryOnly(v: boolean) {
    setPantryOnly(v);
    try {
      localStorage.setItem(PANTRY_ONLY_KEY, String(v));
    } catch {
      // Storage unavailable (private mode); the choice still applies to this visit.
    }
  }

  useEffect(() => {
    if (profile && !prefilled) {
      setPrefs({
        max_cook_time_minutes: profile.max_cook_time_minutes,
        cuisine: profile.preferred_cuisines[0] ?? "Any",
        dietary_restrictions: profile.dietary_restrictions,
        protein_goal_g: profile.protein_goal_g?.toString() ?? "",
      });
      setPrefilled(true);
    }
  }, [profile, prefilled]);

  const { errors: liveErrors, filled } = useMemo(() => validate(rows, prefs), [rows, prefs]);
  // Server messages for a field show until the user edits again (validate() then takes over).
  const errors = { ...serverErrors, ...liveErrors };
  const invalid = Object.keys(liveErrors).length > 0;
  const remainingShown = left ?? remaining;
  const outOfGenerations = remainingShown === 0;

  const edit = (fn: (r: Row[]) => Row[]) => {
    setServerErrors({});
    setRows(fn);
  };
  const update = (key: number, patch: Partial<Row>) => {
    if (patch.name !== undefined) setAssumedHints(({ [key]: _, ...rest }) => rest);
    edit((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  };

  // Runs when the user leaves a name field: basics and spices are cleared with a hint, not added.
  function clearIfAssumed(row: Row) {
    const name = row.name.trim();
    if (!name || !isAssumedIngredient(name)) return;
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    update(row.key, { name: "", quantity: "", unit: "" });
    setAssumedHints((h) => ({ ...h, [row.key]: `${label} is already assumed, no need to add it.` }));
  }

  function quickAdd(name: string) {
    edit((r) => {
      if (r.some((x) => x.name.trim().toLowerCase() === name.toLowerCase())) return r;
      const empty = r.find((x) => !x.name.trim());
      return empty ? r.map((x) => (x.key === empty.key ? { ...x, name } : x)) : [...r, newRow(name)];
    });
  }

  function toLogin() {
    navigate({ to: "/auth", search: { mode: "login" } });
  }

  async function saveAsDefaults(userId: string, protein: number | null) {
    const { error } = await supabase
      .from("profiles")
      .update({
        max_cook_time_minutes: prefs.max_cook_time_minutes,
        preferred_cuisines: prefs.cuisine === "Any" ? [] : [prefs.cuisine],
        dietary_restrictions: prefs.dietary_restrictions,
        protein_goal_g: protein,
      })
      .eq("id", userId);
    if (error) toast.error("Couldn't save your defaults. Your recipes are still being generated.");
    else qc.invalidateQueries({ queryKey: ["profile"] });
  }

  async function generate() {
    if (invalid || loading || outOfGenerations) return;
    setBanner(null);
    setServerErrors({});

    const ingredients = filled.map((r) => ({ name: r.name.trim(), quantity: r.quantity.trim() ? Number(r.quantity) : null, unit: r.unit.trim() || null }));
    const protein = prefs.protein_goal_g.trim() ? Number(prefs.protein_goal_g) : null;
    const preferences = {
      max_cook_time_minutes: prefs.max_cook_time_minutes,
      cuisine: prefs.cuisine,
      dietary_restrictions: prefs.dietary_restrictions,
      protein_goal_g: protein,
      recipe_count: RECIPES_PER_GENERATION,
      pantry_only: pantryOnly,
    };

    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return toLogin();
      if (saveDefaults) await saveAsDefaults(u.user.id, protein);

      const { data, error } = await supabase.functions.invoke<GenerateResponse>("generate-recipes", { body: { ingredients, preferences } });
      if (error) return await handleError(error);
      if (!data?.recipes?.length) return setBanner({ message: GENERIC_ERROR });

      setLeft(data.remaining_generations_today);
      if (typeof data.daily_limit === "number") setLimit(data.daily_limit);
      qc.invalidateQueries({ queryKey: ["usage"] });

      const snapshot = { ingredients, preferences } as unknown as Json;
      const { data: saved, error: saveErr } = await supabase
        .from("recipes")
        .insert(
          data.recipes.slice(0, RECIPES_PER_GENERATION).map((r) => ({
            user_id: u.user!.id,
            title: r.title,
            cuisine: r.cuisine,
            cook_time_minutes: r.cook_time_minutes,
            servings: r.servings,
            ingredients: r.ingredients as unknown as Json,
            missing_ingredients: r.missing_ingredients as unknown as Json,
            steps: r.steps as unknown as Json,
            substitutions: r.substitutions as unknown as Json,
            nutrition: r.nutrition as unknown as Json,
            input_snapshot: snapshot,
          })),
        )
        .select("id");
      if (saveErr) return setBanner({ message: "Your recipes were generated but couldn't be saved. Please try again." });
      qc.invalidateQueries({ queryKey: ["history"] });
      navigate({ to: "/results", search: { ids: saved.map((s) => s.id).join(","), message: data.message ?? undefined } });
    } catch {
      setBanner({ message: GENERIC_ERROR });
    } finally {
      setLoading(false);
    }

    async function handleError(error: unknown) {
      const e = await readFunctionError(error);
      switch (e.code) {
        case "UNAUTHORIZED":
          return toLogin();
        case "NO_INGREDIENTS":
          return setBanner({ message: e.message || "Add at least one ingredient." });
        case "INVALID_INPUT": {
          // Server keys look like "ingredients[2].quantity"; map them back to the row that was sent.
          const inline: Record<string, string> = {};
          for (const [field, msg] of Object.entries(e.fields ?? {})) {
            const m = /^ingredients\[(\d+)\]\.(name|quantity)$/.exec(field);
            const row = m ? filled[Number(m[1])] : undefined;
            if (row) inline[`${m![2] === "name" ? "n" : "q"}${row.key}`] = msg;
            else if (field === "preferences.protein_goal_g") inline["protein"] = msg;
          }
          setServerErrors(inline);
          return setBanner({ message: "Please fix the following and try again:", details: Object.values(e.fields ?? {}) });
        }
        case "DAILY_LIMIT_REACHED":
          setLeft(0);
          return setBanner({ message: e.message });
        case "NO_VALID_RECIPE":
          return setBanner({
            message: e.message,
            details: [
              pantryOnly
                ? "Tip: more ingredients, a longer cooking time, fewer restrictions or turning off \"Only use my ingredients\" give the recipe service more to work with."
                : "Tip: more ingredients, a longer cooking time or fewer restrictions give the recipe service more to work with.",
            ],
          });
        case "AI_UNAVAILABLE":
          return setBanner({ message: e.message || GENERIC_ERROR });
        default:
          return setBanner({ message: GENERIC_ERROR });
      }
    }
  }

  return (
    <div>
      <h1 className="text-4xl font-semibold">What's in your kitchen?</h1>
      <p className="mt-2 text-muted-foreground">Add what you have, set your preferences, and we'll suggest a recipe.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl bg-card p-6 shadow-soft">
          <h2 className="text-2xl font-semibold">Ingredients</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {QUICK_ADD.map((q) => (
              <button key={q} type="button" onClick={() => quickAdd(q)} className="rounded-full bg-block-sage px-3 py-1 text-sm hover:opacity-80">+ {q}</button>
            ))}
          </div>
          <div className="mt-5 space-y-3">
            {rows.map((r) => (
              <div key={r.key}>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ingredient"
                    value={r.name}
                    onChange={(e) => update(r.key, { name: e.target.value })}
                    onBlur={() => clearIfAssumed(r)}
                    onKeyDown={(e) => e.key === "Enter" && clearIfAssumed(r)}
                    className="flex-1"
                    aria-label="Ingredient name"
                    aria-invalid={!!errors[`n${r.key}`]}
                  />
                  <Input placeholder="Qty" value={r.quantity} inputMode="decimal" onChange={(e) => update(r.key, { quantity: e.target.value })} className="w-20" aria-label="Quantity (optional)" aria-invalid={!!errors[`q${r.key}`]} />
                  <Input placeholder="Unit" value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value })} className="w-24" aria-label="Unit (optional)" />
                  <Button variant="ghost" size="icon" aria-label="Remove ingredient" onClick={() => edit((x) => (x.length > 1 ? x.filter((y) => y.key !== r.key) : [newRow()]))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {errors[`n${r.key}`] && <p className="mt-1 text-xs text-destructive">{errors[`n${r.key}`]}</p>}
                {errors[`q${r.key}`] && <p className="mt-1 text-xs text-destructive">{errors[`q${r.key}`]}</p>}
                {assumedHints[r.key] && <p className="mt-1 text-xs text-muted-foreground" role="status">{assumedHints[r.key]}</p>}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Kitchen basics (onion, garlic, tomato, oil, salt) and common spices are assumed. Just add your main ingredients.
          </p>
          {errors["ingredients"] && (
            <p className={`mt-2 text-xs ${filled.length ? "text-destructive" : "text-muted-foreground"}`}>{errors["ingredients"]}</p>
          )}
          <Button variant="outline" size="sm" className="mt-4" onClick={() => edit((r) => [...r, newRow()])}>
            <Plus className="mr-1 h-4 w-4" /> Add row
          </Button>
          <div className="mt-6 flex items-start gap-3 border-t border-border pt-5">
            <Switch id="pantry-only" checked={pantryOnly} onCheckedChange={changePantryOnly} />
            <div>
              <Label htmlFor="pantry-only">Only use my ingredients</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {pantryOnly
                  ? "Recipes use just what you listed, plus kitchen basics and spices. Extras are marked optional."
                  : "Recipes may call for a few ingredients you don't have; they're marked Missing."}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-card p-6 shadow-soft">
          <h2 className="mb-4 text-2xl font-semibold">Preferences</h2>
          <PreferenceFields value={prefs} onChange={(p) => { setServerErrors({}); setPrefs(p); }} proteinError={errors["protein"]} />
          <div className="mt-6 flex items-start gap-2">
            <Checkbox id="save-defaults" checked={saveDefaults} onCheckedChange={(v) => setSaveDefaults(v === true)} />
            <div>
              <Label htmlFor="save-defaults">Save as my defaults</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">Updates your saved cooking time, cuisine, diet and protein target.</p>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        {banner && (
          <div className="w-full">
            <ErrorBanner message={banner.message} details={banner.details} onDismiss={() => setBanner(null)} />
          </div>
        )}
        <Button size="lg" className="rounded-full px-10" onClick={generate} disabled={invalid || loading || outOfGenerations}>
          {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cooking up ideas…</>) : "Generate recipe"}
        </Button>
        {loading ? (
          <p className="text-center text-sm text-muted-foreground">
            We're checking your pantry, diet and timing, then estimating nutrition. This usually takes 10–30 seconds.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {remainingShown ?? "–"} of {limit} recipe generations left today
          </p>
        )}
      </div>
    </div>
  );
}
