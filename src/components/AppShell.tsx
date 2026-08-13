import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, signOutAndRedirect, useWorkspace, type AppRole } from "@/lib/workspace";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { memberships, membership, role, business, selectBusiness } = useWorkspace();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const links: { to: string; label: string; roles: AppRole[] }[] = [
    { to: "/dashboard", label: "Invoices", roles: ["owner", "staff", "accountant", "customer"] },
    { to: "/invoices/new", label: "New invoice", roles: ["owner", "staff"] },
    { to: "/team", label: "Team", roles: ["owner"] },
    {
      to: "/settings",
      label: "Account",
      roles: ["owner", "staff", "accountant", "customer"],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-4">
          <Link to="/dashboard" className="font-display text-base font-bold tracking-tight">
            Invoice Hub
          </Link>

          <nav className="flex items-center gap-1">
            {links
              .filter((link) => role && link.roles.includes(role))
              .map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                    (pathname === link.to
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground")
                  }
                >
                  {link.label}
                </Link>
              ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {memberships.length > 1 ? (
              <Select
                value={membership?.business_id ?? ""}
                onValueChange={(value) => {
                  selectBusiness(value);
                  navigate({ to: "/dashboard" });
                }}
              >
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Choose business" />
                </SelectTrigger>
                <SelectContent>
                  {memberships.map((m) => (
                    <SelectItem key={m.business_id} value={m.business_id}>
                      {m.businesses?.name} · {ROLE_LABELS[m.role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              business && (
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-semibold leading-tight">{business.name}</p>
                  <p className="text-xs text-muted-foreground">{role && ROLE_LABELS[role]}</p>
                </div>
              )
            )}
            <Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOutAndRedirect}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="surface flex flex-col items-center gap-2 p-12 text-center">
      <Wand2 className="size-5 text-muted-foreground" aria-hidden />
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
