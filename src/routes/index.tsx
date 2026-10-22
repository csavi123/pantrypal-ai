import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PantryPal AI — Cook protein-rich meals from your pantry" },
      { name: "description", content: "Tell PantryPal what's in your kitchen and how much time you have. Get healthy, protein-rich recipes in cuisines you love." },
      { property: "og:title", content: "PantryPal AI — Cook protein-rich meals from your pantry" },
      { property: "og:description", content: "Healthy, protein-rich recipes from ingredients you already have, in the time you can spare." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const STEPS = [
  { n: "01", title: "Add ingredients", body: "List what's in your fridge and pantry. Quantities are optional.", block: "bg-block-sage" },
  { n: "02", title: "Set preferences", body: "Pick your time budget, favourite cuisine, diet and protein target.", block: "bg-block-butter" },
  { n: "03", title: "Get recipes", body: "Receive up to three recipes with steps, swaps and estimated nutrition.", block: "bg-block-clay" },
];

function Landing() {
  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-serif text-xl font-semibold">PantryPal <span className="text-primary">AI</span></span>
        <Link to="/auth" className="text-sm font-medium text-muted-foreground hover:text-foreground">Log in</Link>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6">
        <section className="grid items-center gap-10 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
          <div>
            <p className="mb-4 text-sm font-medium uppercase tracking-widest text-primary">Weeknight cooking, solved</p>
            <h1 className="text-5xl font-semibold leading-[1.05] md:text-6xl">
              Protein-rich dinners from what's already in your kitchen.
            </h1>
            <p className="mt-6 max-w-lg text-lg text-muted-foreground">
              PantryPal turns your ingredients, your schedule and your cravings into healthy recipes you'll actually cook.
            </p>
            <Button asChild size="lg" className="mt-8 rounded-full px-8">
              <Link to="/auth" search={{ mode: "signup" }}>Sign up free</Link>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4" aria-hidden>
            <div className="aspect-square rounded-3xl bg-block-clay" />
            <div className="mt-10 aspect-[3/4] rounded-3xl bg-block-sage" />
            <div className="-mt-10 aspect-[3/4] rounded-3xl bg-block-butter" />
            <div className="aspect-square rounded-3xl bg-primary/80" />
          </div>
        </section>
        <section className="pb-24">
          <h2 className="mb-10 text-3xl font-semibold">How it works</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl bg-card p-6 shadow-soft">
                <div className={`mb-6 flex h-12 w-12 items-center justify-center rounded-xl font-serif text-lg font-semibold ${s.block}`}>{s.n}</div>
                <h3 className="text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
