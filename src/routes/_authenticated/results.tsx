import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { recipesByIdsQuery } from "@/lib/queries";
import type { Nutrition } from "@/lib/pantry";

type Search = { ids?: string | undefined; message?: string | undefined };

export const Route = createFileRoute("/_authenticated/results")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ids: typeof s["ids"] === "string" ? s["ids"] : undefined,
    // Only the server's own shortfall note is shown, so a crafted link can't put arbitrary text on the page.
    message: typeof s["message"] === "string" && /^Only [1-3] recipes? met all your requirements\.$/.test(s["message"]) ? s["message"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Your recipes — PantryPal AI" },
      { name: "description", content: "Recipes generated from your ingredients." },
      { property: "og:title", content: "Your recipes — PantryPal AI" },
      { property: "og:description", content: "Recipes generated from your ingredients." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Results,
});

const BLOCKS = ["bg-block-clay", "bg-block-sage", "bg-block-butter"];

function Results() {
  const { ids, message } = Route.useSearch();
  const list = (ids ?? "").split(",").filter(Boolean).slice(0, 3);
  const { data, isLoading } = useQuery(recipesByIdsQuery(list));

  return (
    <div>
      <Link to="/kitchen" className="text-sm text-muted-foreground hover:text-foreground">← Back to kitchen</Link>
      <h1 className="mt-3 text-4xl font-semibold">Your recipes</h1>
      {message && <p className="mt-2 text-muted-foreground">{message}</p>}
      {isLoading ? (
        <p className="mt-8 text-muted-foreground">Loading…</p>
      ) : !data?.length ? (
        <p className="mt-8 text-muted-foreground">No recipes to show. Head back to the kitchen to generate some.</p>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {data.map((r, i) => {
            const n = r.nutrition as unknown as Nutrition | null;
            // Older recipes listed staples as "<name> (basic staple)"; those don't count as missing.
            const missing = Array.isArray(r.missing_ingredients)
              ? r.missing_ingredients.filter((m) => typeof m !== "string" || !m.endsWith(" (basic staple)")).length
              : 0;
            return (
              <Link key={r.id} to="/recipes/$id" params={{ id: r.id }} className="group overflow-hidden rounded-2xl bg-card shadow-soft transition-transform hover:-translate-y-1">
                <div className={`h-24 ${BLOCKS[i % 3]}`} />
                <div className="p-5">
                  <p className="text-xs uppercase tracking-widest text-primary">{r.cuisine}</p>
                  <h2 className="mt-1 text-xl font-semibold group-hover:text-primary">{r.title}</h2>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <span className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3.5 w-3.5" />{r.cook_time_minutes} min</span>
                    {n?.protein_g != null && n?.calories_kcal != null ? (
                      <>
                        <span>≈ {n.protein_g} g protein</span>
                        <span className="text-muted-foreground">≈ {n.calories_kcal} kcal <span className="text-xs">(est.)</span></span>
                      </>
                    ) : (
                      <span className="col-span-2 text-muted-foreground">Nutrition unavailable</span>
                    )}
                    <span className={missing ? "text-primary" : "text-success"}>{missing ? `${missing} missing` : "All in pantry"}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
