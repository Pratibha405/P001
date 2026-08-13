import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  formatDate,
  formatMoney,
  ROLE_LABELS,
  useBootstrapAccount,
  useCurrentUser,
  useWorkspace,
  type Invoice,
} from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Invoices — Invoice Hub" },
      {
        name: "description",
        content: "Track drafts, invoices awaiting approval and approved invoices for your business.",
      },
      { property: "og:title", content: "Invoices — Invoice Hub" },
      { property: "og:description", content: "Your business invoice pipeline in one place." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const ready = useBootstrapAccount();
  const { data: user } = useCurrentUser();
  const { membership, role, isPending, memberships } = useWorkspace();

  const invoices = useQuery({
    queryKey: ["invoices", membership?.business_id],
    enabled: Boolean(membership?.business_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("business_id", membership!.business_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Invoice[];
    },
  });

  if (!ready || isPending) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading your workspace…</p>
      </AppShell>
    );
  }

  if (memberships.length === 0) return <Navigate to="/onboarding" replace />;

  const rows = invoices.data ?? [];
  const counts = {
    draft: rows.filter((r) => r.status === "draft").length,
    pending: rows.filter((r) => r.status === "pending_approval").length,
    approved: rows.filter((r) => r.status === "approved").length,
  };

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {role === "customer" ? "Your invoices" : "Invoices"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as {user?.email} · {role ? ROLE_LABELS[role] : ""}
          </p>
        </div>
        {(role === "owner" || role === "staff") && (
          <Button asChild>
            <Link to="/invoices/new">New invoice</Link>
          </Button>
        )}
      </div>

      {role !== "customer" && (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Drafts" value={counts.draft} />
          <Stat label="Awaiting your approval" value={counts.pending} />
          <Stat label="Approved & sent" value={counts.approved} />
        </div>
      )}

      <div className="mt-8">
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            body={
              role === "customer"
                ? "Approved invoices addressed to your email will appear here."
                : "Create your first invoice to start the approval workflow."
            }
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((invoice) => (
              <li key={invoice.id}>
                <Link
                  to="/invoices/$invoiceId"
                  params={{ invoiceId: invoice.id }}
                  className="surface flex flex-wrap items-center gap-4 p-5 transition-shadow hover:shadow-lift"
                >
                  <div className="min-w-48 flex-1">
                    <p className="font-display text-sm font-semibold">{invoice.invoice_number}</p>
                    <p className="text-sm text-muted-foreground">
                      {invoice.customer_name} · {invoice.customer_email}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(invoice.invoice_date)}
                  </p>
                  <p className="font-display text-base font-semibold">
                    {formatMoney(invoice.total_amount)}
                  </p>
                  <StatusBadge status={invoice.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-display mt-1 text-3xl font-bold">{value}</p>
    </div>
  );
}
