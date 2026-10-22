import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/ErrorBanner";
import { PreferenceFields, validateProtein, type Prefs } from "@/components/PreferenceFields";
import { DAILY_LIMIT, QUICK_ADD, describeFunctionError, type GenerateResponse } from "@/lib/pantry";
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
let k = 0;
const newRow = (name = ""): Row => ({ key: ++k, name, quantity: "", unit: "" });

function Kitchen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useQuery(profileQuery);
  const { data: remaining } = useQuery(usageQuery);
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [prefs, setPrefs] = useState<Prefs>({ max_cook_time_minutes: 30, cuisine: "Any", dietary_restrictions: [], protein_goal_g: "" });
  const [prefilled, setPrefilled] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [left, setLeft] = useState<number | null>(null);

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

  const remainingShown = left ?? remaining;
  const update = (key: number, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  function quickAdd(name: string) {
    setRows((r) => {
      if (r.some((x) => x.name.trim().toLowerCase() === name.toLowerCase())) return r;
      const empty = r.find((x) => !x.name.trim());
      return empty ? r.map((x) => (x.key === empty.key ? { ...x, name } : x)) : [...r, newRow(name)];
    });
  }

  async function generate() {
    const e: Record<string, string> = {};
    const filled = rows.filter((r) => r.name.trim());
    if (!filled.length) e["ingredients"] = "Add at least one ingredient.";
    for (const r of filled) {
      if (r.quantity.trim() && !(Number(r.quantity) > 0)) e[`q${r.key}`] = "Use a positive number.";
    }
    const pErr = validateProtein(prefs.protein_goal_g);
    if (pErr) e["protein"] = pErr;
    setErrors(e);
    setBanner(null);
    if (Object.keys(e).length) return;

    const ingredients = filled.map((r) => ({ name: r.name.trim(), quantity: r.quantity.trim() ? Number(r.quantity) : null, unit: r.unit.trim() || null }));
    const preferences = {
      max_cook_time_minutes: prefs.max_cook_time_minutes,
      cuisine: prefs.cuisine,
      dietary_restrictions: prefs.dietary_restrictions,
      protein_goal_g: prefs.protein_goal_g.trim() ? Number(prefs.protein_goal_g) : null,
    };

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<GenerateResponse | { error: { code: string; message: string } }>("generate-recipes", { body: { ingredients, preferences } });
      if (error) throw new Error(await describeFunctionError(error));
      if (!data || "error" in data) throw new Error(data && "error" in data ? data.error.message : "No response from the recipe service.");
      if (typeof data.remaining_generations_today === "number") setLeft(data.remaining_generations_today);
      qc.invalidateQueries({ queryKey: ["usage"] });
      const recipes = (data.recipes ?? []).slice(0, 3);
      if (!recipes.length) throw new Error(data.message || "No recipes matched. Try adding more ingredients.");

      const { data: u } = await supabase.auth.getUser();
      const snapshot = { ingredients, preferences } as unknown as Json;
      const { data: saved, error: saveErr } = await supabase
        .from("recipes")
        .insert(
          recipes.map((r) => ({
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
      if (saveErr) throw new Error(`Couldn't save recipes: ${saveErr.message}`);
      qc.invalidateQueries({ queryKey: ["history"] });
      navigate({ to: "/results", search: { ids: saved.map((s) => s.id).join(","), message: data.message ?? undefined } });
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Something went wrong while generating recipes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-4xl font-semibold">What's in your kitchen?</h1>
      <p className="mt-2 text-muted-foreground">Add what you have, set your preferences, and we'll suggest up to three recipes.</p>

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
                  <Input placeholder="Ingredient" value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} className="flex-1" aria-label="Ingredient name" />
                  <Input placeholder="Qty" value={r.quantity} inputMode="decimal" onChange={(e) => update(r.key, { quantity: e.target.value })} className="w-20" aria-label="Quantity" aria-invalid={!!errors[`q${r.key}`]} />
                  <Input placeholder="Unit" value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value })} className="w-24" aria-label="Unit" />
                  <Button variant="ghost" size="icon" aria-label="Remove ingredient" onClick={() => setRows((x) => (x.length > 1 ? x.filter((y) => y.key !== r.key) : [newRow()]))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {errors[`q${r.key}`] && <p className="mt-1 text-xs text-destructive">{errors[`q${r.key}`]}</p>}
              </div>
            ))}
          </div>
          {errors["ingredients"] && <p className="mt-2 text-xs text-destructive">{errors["ingredients"]}</p>}
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setRows((r) => [...r, newRow()])}>
            <Plus className="mr-1 h-4 w-4" /> Add row
          </Button>
        </section>

        <section className="rounded-2xl bg-card p-6 shadow-soft">
          <h2 className="mb-4 text-2xl font-semibold">Preferences</h2>
          <PreferenceFields value={prefs} onChange={setPrefs} proteinError={errors["protein"]} />
        </section>
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        {banner && <div className="w-full"><ErrorBanner message={banner} onDismiss={() => setBanner(null)} /></div>}
        <Button size="lg" className="rounded-full px-10" onClick={generate} disabled={loading || remainingShown === 0}>
          {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cooking up ideas…</>) : "Generate recipes"}
        </Button>
        <p className="text-sm text-muted-foreground">
          {remainingShown ?? "–"} of {DAILY_LIMIT} recipe generations left today
        </p>
      </div>
    </div>
  );
}
