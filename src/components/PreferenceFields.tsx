import { COOK_TIMES, CUISINES, DIETS } from "@/lib/pantry";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type Prefs = { max_cook_time_minutes: number; cuisine: string; dietary_restrictions: string[]; protein_goal_g: string };

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary"}`}
    >
      {children}
    </button>
  );
}

export function PreferenceFields({ value, onChange, proteinError }: { value: Prefs; onChange: (p: Prefs) => void; proteinError?: string }) {
  return (
    <div className="space-y-6">
      <div>
        <Label className="mb-2 block">Max cooking time</Label>
        <div className="flex flex-wrap gap-2">
          {COOK_TIMES.map((t) => (
            <Pill key={t} active={value.max_cook_time_minutes === t} onClick={() => onChange({ ...value, max_cook_time_minutes: t })}>{t} min</Pill>
          ))}
        </div>
      </div>
      <div>
        <Label className="mb-2 block">Cuisine</Label>
        <div className="flex flex-wrap gap-2">
          {CUISINES.map((c) => (
            <Pill key={c} active={value.cuisine === c} onClick={() => onChange({ ...value, cuisine: c })}>{c}</Pill>
          ))}
        </div>
      </div>
      <div>
        <Label className="mb-2 block">Dietary restrictions</Label>
        <div className="flex flex-wrap gap-2">
          {DIETS.map((d) => {
            const on = value.dietary_restrictions.includes(d);
            return (
              <Pill key={d} active={on} onClick={() => onChange({ ...value, dietary_restrictions: on ? value.dietary_restrictions.filter((x) => x !== d) : [...value.dietary_restrictions, d] })}>
                {d}
              </Pill>
            );
          })}
        </div>
      </div>
      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="protein">Protein target (g, optional)</Label>
        <Input id="protein" inputMode="numeric" value={value.protein_goal_g} onChange={(e) => onChange({ ...value, protein_goal_g: e.target.value })} aria-invalid={!!proteinError} placeholder="e.g. 35" />
        {proteinError && <p className="text-xs text-destructive">{proteinError}</p>}
      </div>
    </div>
  );
}

export function validateProtein(v: string): string | undefined {
  if (!v.trim()) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 300) return "Enter a whole number between 1 and 300.";
  return undefined;
}
