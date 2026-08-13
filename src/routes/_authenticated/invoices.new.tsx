import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { InvoiceForm } from "@/components/InvoiceForm";
import { useBootstrapAccount, useCurrentUser, useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/invoices/new")({
  head: () => ({
    meta: [
      { title: "New invoice — Invoice Hub" },
      {
        name: "description",
        content:
          "Create an invoice with customer details, line items, quantities and attached receipts.",
      },
      { property: "og:title", content: "New invoice — Invoice Hub" },
      { property: "og:description", content: "Draft an invoice and send it for owner approval." },
    ],
  }),
  component: NewInvoice,
});

function NewInvoice() {
  const ready = useBootstrapAccount();
  const { data: user } = useCurrentUser();
  const { membership, role, isPending } = useWorkspace();

  if (!ready || isPending) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  if (!membership) return <Navigate to="/onboarding" replace />;
  if (role !== "owner" && role !== "staff") return <Navigate to="/dashboard" replace />;

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold">New invoice</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Save it as a draft while you work, then send it to the owner for approval.
      </p>
      <div className="mt-6">
        <InvoiceForm businessId={membership.business_id} userId={user!.id} canSubmit />
      </div>
    </AppShell>
  );
}
