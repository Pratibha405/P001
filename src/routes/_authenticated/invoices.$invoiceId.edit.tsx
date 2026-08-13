import { createFileRoute, Navigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { InvoiceForm, type ItemDraft } from "@/components/InvoiceForm";
import { useBootstrapAccount, useCurrentUser, useWorkspace, type Invoice } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/invoices/$invoiceId/edit")({
  head: () => ({
    meta: [
      { title: "Edit invoice — Invoice Hub" },
      { name: "description", content: "Update invoice details, items and attachments." },
      { property: "og:title", content: "Edit invoice — Invoice Hub" },
      { property: "og:description", content: "Update an invoice before it goes for approval." },
    ],
  }),
  component: EditInvoice,
});

function EditInvoice() {
  const { invoiceId } = useParams({ from: "/_authenticated/invoices/$invoiceId/edit" });
  const ready = useBootstrapAccount();
  const { data: user } = useCurrentUser();
  const { membership, role, isPending } = useWorkspace();

  const data = useQuery({
    queryKey: ["invoice-edit", invoiceId],
    queryFn: async () => {
      const [invoice, items, attachments] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle(),
        supabase
          .from("invoice_items")
          .select("id, description, quantity, unit_price")
          .eq("invoice_id", invoiceId)
          .order("created_at"),
        supabase
          .from("invoice_attachments")
          .select("id, file_name, file_path")
          .eq("invoice_id", invoiceId)
          .order("created_at"),
      ]);
      return {
        invoice: (invoice.data as Invoice) ?? null,
        items: (items.data ?? []).map<ItemDraft>((item) => ({
          key: item.id,
          description: item.description,
          quantity: String(item.quantity),
          unit_price: String(item.unit_price),
        })),
        attachments: attachments.data ?? [],
      };
    },
  });

  if (!ready || isPending || data.isPending) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading invoice…</p>
      </AppShell>
    );
  }

  if (!membership) return <Navigate to="/onboarding" replace />;
  if (role !== "owner" && role !== "staff") return <Navigate to="/dashboard" replace />;
  if (!data.data?.invoice) return <Navigate to="/dashboard" replace />;
  if (role === "staff" && data.data.invoice.status !== "draft") {
    return (
      <AppShell>
        <h1 className="text-2xl font-semibold">Locked for approval</h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          This invoice has been forwarded to the business owner. You can edit it again only after the
          owner sends it back to draft.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold">Edit {data.data.invoice.invoice_number}</h1>
      <div className="mt-6">
        <InvoiceForm
          businessId={membership.business_id}
          userId={user!.id}
          invoice={data.data.invoice}
          initialItems={data.data.items}
          existingAttachments={data.data.attachments}
          canSubmit
        />
      </div>
    </AppShell>
  );
}
