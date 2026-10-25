import { createFileRoute, Link } from "@tanstack/react-router";
import { ChefHat, Clock, History as HistoryIcon, SlidersHorizontal } from "lucide-react";
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
  { n: "03", title: "Get recipes", body: "Receive a recipe with steps, swaps and estimated nutrition.", block: "bg-block-clay" },
];

// Hero illustration: a board of raw ingredients and the phone showing what they became.
// Photos are Unsplash stock, used as illustrations only.
const unsplash = (id: string) => `https://images.unsplash.com/${id}?w=560&q=70&auto=format&fit=crop`;
const PANTRY_PHOTO = unsplash("photo-1466637574441-749b8f19452f");
const PANTRY_ITEMS = ["Eggs", "Tomatoes", "Spinach", "Mushrooms"];
const SAMPLE_RECIPES = [
  { title: "Spinach & egg shakshuka", cuisine: "Mediterranean", minutes: 25, status: "All in pantry", ok: true, image: unsplash("photo-1590412200988-a436970781fa") },
  { title: "Vegetable curry with rice", cuisine: "Indian", minutes: 30, status: "All in pantry", ok: true, image: unsplash("photo-1585937421612-70a008356fbe") },
  { title: "Veggie fried rice", cuisine: "Asian", minutes: 15, status: "All in pantry", ok: true, image: unsplash("photo-1603133872878-684f208fb84b") },
];

function HeroVisual() {
  return (
    <div className="relative mx-auto h-[600px] w-full max-w-[520px]" aria-hidden>
      {/* What you have */}
      <figure className="absolute left-0 top-16 hidden w-[260px] -rotate-6 overflow-hidden rounded-3xl bg-card shadow-soft sm:block">
        <img src={PANTRY_PHOTO} alt="" className="h-[300px] w-full object-cover" />
        <figcaption className="py-3 pl-4 pr-24">
          <p className="text-[10px] font-medium uppercase tracking-widest text-primary">In your pantry</p>
          <p className="mt-1 text-sm">{PANTRY_ITEMS.join(" · ")}</p>
        </figcaption>
      </figure>

      {/* What PantryPal suggests */}
      <div className="absolute right-1/2 top-0 h-[580px] w-[290px] translate-x-1/2 rotate-2 rounded-[2.75rem] border-[10px] border-foreground bg-background shadow-soft sm:right-0 sm:translate-x-0">
        <div className="flex h-full flex-col overflow-hidden rounded-[2rem]">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="font-serif text-base font-semibold">PantryPal <span className="text-primary">AI</span></span>
            <span className="text-xs text-muted-foreground">Your recipes</span>
          </div>
          <div className="flex-1 space-y-3 overflow-hidden px-3 pt-3">
            {SAMPLE_RECIPES.map((r) => (
              <div key={r.title} className="overflow-hidden rounded-2xl bg-card shadow-soft">
                <div className="relative h-32">
                  <img src={r.image} alt="" loading="lazy" className="size-full object-cover" />
                  <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${r.ok ? "bg-block-sage text-success" : "bg-block-butter text-primary"}`}>{r.status}</span>
                  <span className="absolute bottom-2 left-2 rounded-full bg-foreground/80 px-2 py-0.5 text-[9px] uppercase tracking-widest text-background">{r.cuisine}</span>
                </div>
                <div className="px-3 py-2">
                  <p className="text-sm font-semibold">{r.title}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" /> {r.minutes} min · High protein
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 border-t border-border bg-card py-2 text-[10px] text-muted-foreground">
            <span className="flex flex-col items-center gap-0.5 text-primary"><ChefHat className="h-4 w-4" />Kitchen</span>
            <span className="flex flex-col items-center gap-0.5"><HistoryIcon className="h-4 w-4" />History</span>
            <span className="flex flex-col items-center gap-0.5"><SlidersHorizontal className="h-4 w-4" />Preferences</span>
          </div>
        </div>
      </div>
    </div>
  );
}

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
              Protein-rich dinners from what's{" "}
              <em className="font-normal italic text-primary">already in your kitchen.</em>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-muted-foreground">
              PantryPal turns your ingredients, your schedule and your cravings into healthy recipes you'll actually cook.
            </p>
            <Button asChild size="lg" className="mt-8 rounded-full px-8">
              <Link to="/auth" search={{ mode: "signup" }}>Sign up free</Link>
            </Button>
          </div>
          <HeroVisual />
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
