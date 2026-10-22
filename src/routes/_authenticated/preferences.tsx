import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/ErrorBanner";
import { PreferenceFields, validateProtein, type Prefs } from "@/components/PreferenceFields";
import { profileQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/preferences")({
  head: () => ({
    meta: [
      { title: "Preferences — PantryPal AI" },
      { name: "description", content: "Save your default cooking time, cuisine, diet and protein goal." },
      { property: "og:title", content: "Preferences — PantryPal AI" },
      { property: "og:description", content: "Save your default cooking time, cuisine, diet and protein goal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PreferencesPage,
});

function PreferencesPage() {
  const qc = useQueryClient();
  const { data: profile, isLoading } = useQuery(profileQuery);
  const [name, setName] = useState("");
  const [prefs, setPrefs] = useState<Prefs>({ max_cook_time_minutes: 30, cuisine: "Any", dietary_restrictions: [], protein_goal_g: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setName(profile.display_name ?? "");
    setPrefs({
      max_cook_time_minutes: profile.max_cook_time_minutes,
      cuisine: profile.preferred_cuisines[0] ?? "Any",
      dietary_restrictions: profile.dietary_restrictions,
      protein_goal_g: profile.protein_goal_g?.toString() ?? "",
    });
  }, [profile]);

  async function save() {
    const e: Record<string, string> = {};
    const p = validateProtein(prefs.protein_goal_g);
    if (p) e.protein = p;
    if (name.length > 60) e.name = "Keep your name under 60 characters.";
    setErrors(e);
    setErr(null);
    if (Object.keys(e).length) return;
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").upsert({
      id: u.user!.id,
      display_name: name.trim() || null,
      max_cook_time_minutes: prefs.max_cook_time_minutes,
      preferred_cuisines: prefs.cuisine === "Any" ? [] : [prefs.cuisine],
      dietary_restrictions: prefs.dietary_restrictions,
      protein_goal_g: prefs.protein_goal_g.trim() ? Number(prefs.protein_goal_g) : null,
    });
    setSaving(false);
    if (error) return setErr(error.message);
    toast.success("Preferences saved");
    qc.invalidateQueries({ queryKey: ["profile"] });
  }

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-4xl font-semibold">Preferences</h1>
      <p className="mt-2 text-muted-foreground">These pre-fill your kitchen every time.</p>
      <div className="mt-8 space-y-6 rounded-2xl bg-card p-6 shadow-soft">
        <div className="max-w-sm space-y-1.5">
          <Label htmlFor="dn">Display name</Label>
          <Input id="dn" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
          {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </div>
        <PreferenceFields value={prefs} onChange={setPrefs} proteinError={errors.protein} />
        {err && <ErrorBanner message={err} />}
        <Button onClick={save} disabled={saving} className="rounded-full">{saving ? "Saving…" : "Save preferences"}</Button>
      </div>
    </div>
  );
}
