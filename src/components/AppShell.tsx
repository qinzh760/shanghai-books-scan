import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { BookOpen, FileText, Receipt, BarChart3, ListTree, LogOut, Users, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Översikt", icon: BarChart3 },
  { to: "/verifikationer", label: "Verifikationer", icon: FileText },
  { to: "/kvitton", label: "Kvitton", icon: Receipt },
  { to: "/konton", label: "Kontoplan", icon: ListTree },
  { to: "/rapporter", label: "Rapporter", icon: BookOpen },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const nav2 = useNavigate();
  const { user, roles, isAdmin } = useAuth();

  const signOut = async () => {
    await supabase.auth.signOut();
    nav2({ to: "/login" });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-sidebar-border">
          <Building2 className="h-6 w-6 text-sidebar-primary" />
          <div>
            <div className="text-sm font-semibold leading-tight">SAS Bokföring</div>
            <div className="text-[11px] text-sidebar-foreground/60">Shanghai Association Sweden</div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map((n) => {
            const active = loc.pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              to="/anvandare"
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                loc.pathname.startsWith("/anvandare")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <Users className="h-4 w-4" />
              Användare
            </Link>
          )}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="px-2 py-2 text-xs text-sidebar-foreground/70">
            <div className="truncate font-medium text-sidebar-foreground">{user?.email}</div>
            <div className="mt-0.5 capitalize">{roles.join(", ") || "ingen roll"}</div>
          </div>
          <button
            onClick={signOut}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent/50"
          >
            <LogOut className="h-4 w-4" /> Logga ut
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="md:hidden flex items-center gap-2 border-b bg-card px-4 py-3">
          <Building2 className="h-5 w-5 text-primary" />
          <span className="font-semibold">SAS Bokföring</span>
        </div>
        <div className="p-6 md:p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
