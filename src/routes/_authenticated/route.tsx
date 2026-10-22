import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { mode: "login" } });
    return { user: data.user };
  },
  component: AppLayout,
});

const NAV = [
  { to: "/kitchen", label: "Kitchen" },
  { to: "/history", label: "History" },
  { to: "/preferences", label: "Preferences" },
] as const;

function AppLayout() {
  const navigate = useNavigate();
  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <Link to="/kitchen" className="font-serif text-xl font-semibold">PantryPal <span className="text-primary">AI</span></Link>
          <nav className="flex items-center gap-1 text-sm">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="rounded-full px-3 py-1.5 text-muted-foreground hover:text-foreground" activeProps={{ className: "bg-secondary text-foreground" }}>
                {n.label}
              </Link>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="ml-2"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/" });
              }}
            >
              Sign out
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <Outlet />
      </main>
    </>
  );
}
