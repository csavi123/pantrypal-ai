import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { historyQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Recipe history — PantryPal AI" },
      { name: "description", content: "All the recipes you've generated." },
      { property: "og:title", content: "Recipe history — PantryPal AI" },
      { property: "og:description", content: "All the recipes you've generated." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: History,
});

function History() {
  const { data, isLoading } = useQuery(historyQuery);
  return (
    <div>
      <h1 className="text-4xl font-semibold">History</h1>
      {isLoading ? (
        <p className="mt-8 text-muted-foreground">Loading…</p>
      ) : !data?.length ? (
        <div className="mt-10 rounded-3xl bg-block-butter px-6 py-16 text-center">
          <h2 className="text-2xl font-semibold">No recipes yet</h2>
          <p className="mt-2 text-muted-foreground">Generate your first batch from the kitchen.</p>
          <Button asChild className="mt-6 rounded-full"><Link to="/kitchen">Go to kitchen</Link></Button>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-border rounded-2xl bg-card shadow-soft">
          {data.map((r) => {
            const fb = r.recipe_feedback?.[0]?.rating;
            return (
              <li key={r.id}>
                <Link to="/recipes/$id" params={{ id: r.id }} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-secondary/50">
                  <div>
                    <p className="font-medium">{r.title}</p>
                    <p className="text-sm text-muted-foreground">{r.cuisine} · {r.cook_time_minutes} min · {new Date(r.created_at).toLocaleDateString()}</p>
                  </div>
                  {fb === "helpful" ? <Badge className="bg-success text-success-foreground hover:bg-success">Helpful</Badge> : fb === "unhelpful" ? <Badge variant="outline" className="border-primary text-primary">Not helpful</Badge> : <Badge variant="secondary">No feedback</Badge>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
