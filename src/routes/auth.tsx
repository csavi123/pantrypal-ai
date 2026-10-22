import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/ErrorBanner";

type Search = { mode?: "login" | "signup" };

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): Search => ({ mode: s.mode === "signup" ? "signup" : "login" }),
  head: () => ({
    meta: [
      { title: "Log in or sign up — PantryPal AI" },
      { name: "description", content: "Sign in to PantryPal AI to start cooking from your pantry." },
      { property: "og:title", content: "Log in or sign up — PantryPal AI" },
      { property: "og:description", content: "Sign in to PantryPal AI to start cooking from your pantry." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode = "login" } = Route.useSearch();
  const navigate = useNavigate();
  const isSignup = mode === "signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) fe.email = "Enter a valid email address.";
    if (password.length < 6) fe.password = "Password must be at least 6 characters.";
    setFieldErrors(fe);
    setError(null);
    setInfo(null);
    if (Object.keys(fe).length) return;
    setBusy(true);
    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/kitchen`, data: { display_name: name || null } },
      });
      if (error) setError(error.message);
      else if (!data.session) setInfo("Check your email to confirm your account, then log in.");
      else navigate({ to: "/kitchen" });
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else navigate({ to: "/kitchen" });
    }
    setBusy(false);
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-3xl bg-card p-8 shadow-soft">
        <Link to="/" className="font-serif text-lg font-semibold">PantryPal <span className="text-primary">AI</span></Link>
        <h1 className="mt-6 text-3xl font-semibold">{isSignup ? "Create your account" : "Welcome back"}</h1>
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          {error && <ErrorBanner message={error} />}
          {info && <p className="rounded-xl bg-block-sage px-4 py-3 text-sm">{info}</p>}
          {isSignup && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Name (optional)</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!fieldErrors.email} />
            {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!fieldErrors.password} />
            {fieldErrors.password && <p className="text-xs text-destructive">{fieldErrors.password}</p>}
          </div>
          <Button type="submit" className="w-full rounded-full" disabled={busy}>
            {busy ? "Please wait…" : isSignup ? "Sign up" : "Log in"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isSignup ? "Already have an account? " : "New here? "}
          <Link to="/auth" search={{ mode: isSignup ? "login" : "signup" }} className="font-medium text-primary">
            {isSignup ? "Log in" : "Create an account"}
          </Link>
        </p>
      </div>
    </main>
  );
}
