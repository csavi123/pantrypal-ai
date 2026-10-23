import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ErrorBanner } from "@/components/ErrorBanner";
import { recipeQuery } from "@/lib/queries";
import type { GeneratedRecipe, Nutrition } from "@/lib/pantry";

export const Route = createFileRoute("/_authenticated/recipes/$id")({
  head: () => ({
    meta: [
      { title: "Recipe — PantryPal AI" },
      { name: "description", content: "Ingredients, steps, swaps and estimated nutrition." },
      { property: "og:title", content: "Recipe — PantryPal AI" },
      { property: "og:description", content: "Ingredients, steps, swaps and estimated nutrition." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecipeDetail,
});

function RecipeDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: r, isLoading } = useQuery(recipeQuery(id));
  const existing = r?.recipe_feedback?.[0];
  const [rating, setRating] = useState<"helpful" | "unhelpful" | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setRating(existing.rating as "helpful" | "unhelpful");
      setReason(existing.reason ?? "");
    }
  }, [existing]);

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!r) return <p className="text-muted-foreground">Recipe not found. <Link to="/history" className="text-primary">Back to history</Link></p>;

  const ingredients = (r.ingredients as unknown as GeneratedRecipe["ingredients"]) ?? [];
  const steps = (r.steps as unknown as string[]) ?? [];
  const subs = (r.substitutions as unknown as GeneratedRecipe["substitutions"]) ?? [];
  const n = r.nutrition as unknown as Nutrition | null;
  const hasNutrition = n?.calories_kcal != null && n?.protein_g != null;
  // Staples come flagged per ingredient; recipes saved before that carry a "(basic staple)" suffix instead.
  const missingList = Array.isArray(r.missing_ingredients) ? (r.missing_ingredients as string[]) : [];
  const staples = new Set(missingList.filter((m) => m.endsWith(" (basic staple)")).map((m) => m.slice(0, -" (basic staple)".length)));

  async function save() {
    if (!rating) return;
    if (reason.length > 500) return setErr("Keep the reason under 500 characters.");
    setSaving(true);
    setErr(null);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("recipe_feedback")
      .upsert({ user_id: u.user!.id, recipe_id: id, rating, reason: reason.trim() || null }, { onConflict: "user_id,recipe_id" });
    setSaving(false);
    if (error) return setErr(error.message);
    toast.success("Thanks for the feedback!");
    qc.invalidateQueries({ queryKey: ["recipe", id] });
    qc.invalidateQueries({ queryKey: ["history"] });
  }

  return (
    <article className="mx-auto max-w-3xl">
      <Link to="/history" className="text-sm text-muted-foreground hover:text-foreground">← History</Link>
      <p className="mt-4 text-xs uppercase tracking-widest text-primary">{r.cuisine} · {r.cook_time_minutes} min · serves {r.servings}</p>
      <h1 className="mt-2 text-4xl font-semibold md:text-5xl">{r.title}</h1>

      <section className="mt-8 rounded-2xl bg-card p-6 shadow-soft">
        <h2 className="text-2xl font-semibold">Ingredients</h2>
        <ul className="mt-4 divide-y divide-border">
          {ingredients.map((i, idx) => (
            <li key={idx} className="flex items-center justify-between gap-3 py-2.5">
              <span>{[i.quantity, i.unit].filter((x) => x != null && x !== "").join(" ")} {i.name}</span>
              {i.in_pantry && i.pantry_shortfall ? (
                <Badge variant="outline" className="border-primary text-primary">Need more ({i.pantry_shortfall})</Badge>
              ) : i.in_pantry ? (
                <Badge className="bg-success text-success-foreground hover:bg-success">In your pantry</Badge>
              ) : i.is_staple || staples.has(i.name) ? (
                <Badge variant="secondary">Basic staple</Badge>
              ) : (
                <Badge variant="outline" className="border-primary text-primary">Missing</Badge>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-2xl font-semibold">Steps</h2>
        <ol className="mt-4 space-y-4">
          {steps.map((s, idx) => (
            <li key={idx} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-block-clay font-serif font-semibold">{idx + 1}</span>
              <p className="pt-1">{s}</p>
            </li>
          ))}
        </ol>
      </section>

      {subs.length > 0 && (
        <section className="mt-8 rounded-2xl bg-block-butter p-6">
          <h2 className="text-2xl font-semibold">Substitutions</h2>
          <ul className="mt-3 space-y-1.5">
            {subs.map((s, idx) => <li key={idx}><strong>{s.ingredient}</strong> → {s.substitute}</li>)}
          </ul>
        </section>
      )}

      {n && (
        <section className="mt-6 rounded-2xl bg-card p-6 shadow-soft">
          <h2 className="text-2xl font-semibold">Nutrition</h2>
          {hasNutrition ? (
            <p className="mt-3">
              <span className="font-semibold">≈ {n.calories_kcal} kcal · ≈ {n.protein_g} g protein</span> per serving{" "}
              <span className="text-sm text-muted-foreground">(estimate, {n.source})</span>
            </p>
          ) : (
            <p className="mt-3 font-semibold">Nutrition unavailable</p>
          )}
          {n.unavailable_items?.length > 0 && <p className="mt-1 text-xs text-muted-foreground">No data for: {n.unavailable_items.join(", ")}</p>}
          {n.protein_note && <p className="mt-3 text-sm text-primary">{n.protein_note}</p>}
        </section>
      )}

      <section className="mt-8 rounded-2xl border border-border p-6">
        <h2 className="text-xl font-semibold">Was this recipe helpful?</h2>
        <div className="mt-4 flex gap-2">
          <Button variant={rating === "helpful" ? "default" : "outline"} onClick={() => setRating("helpful")}><ThumbsUp className="mr-1 h-4 w-4" /> Helpful</Button>
          <Button variant={rating === "unhelpful" ? "default" : "outline"} onClick={() => setRating("unhelpful")}><ThumbsDown className="mr-1 h-4 w-4" /> Not helpful</Button>
        </div>
        {rating && (
          <div className="mt-4 space-y-3">
            <Textarea placeholder="Tell us why (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={600} />
            {err && <ErrorBanner message={err} />}
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : existing ? "Update feedback" : "Submit feedback"}</Button>
          </div>
        )}
      </section>
    </article>
  );
}
