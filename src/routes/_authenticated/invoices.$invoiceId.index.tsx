import { createFileRoute, Link, Navigate, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Download, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  formatDate,
  formatMoney,
  useBootstrapAccount,
  useCurrentUser,
  useWorkspace,
  type Invoice,
} from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/invoices/$invoiceId/")({
  head: () => ({
    meta: [
      { title: "Invoice detail — Invoice Hub" },
      {
        name: "description",
        content: "Review invoice items, accountant comments and attachments before approval.",
      },
      { property: "og:title", content: "Invoice detail — Invoice Hub" },
      {
        property: "og:description",
        content: "Items, comments, attachments and approval status for one invoice.",
      },
    ],
  }),
  component: InvoiceDetail,
});

type Comment = { id: string; body: string; author_id: string; created_at: string };

function InvoiceDetail() {
  const { invoiceId } = useParams({ from: "/_authenticated/invoices/$invoiceId/" });
  const ready = useBootstrapAccount();
  const { data: user } = useCurrentUser();
  const { role, isPending } = useWorkspace();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [comment, setComment] = useState("");

  const invoice = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .maybeSingle();
      if (error) throw error;
      return (data as Invoice) ?? null;
    },
  });

  const items = useQuery({
    queryKey: ["invoice-items", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_items")
        .select("id, description, quantity, unit_price")
        .eq("invoice_id", invoiceId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const attachments = useQuery({
    queryKey: ["invoice-attachments", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_attachments")
        .select("id, file_name, file_path")
        .eq("invoice_id", invoiceId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const comments = useQuery({
    queryKey: ["invoice-comments", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_comments")
        .select("id, body, author_id, created_at")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Comment[];
      const ids = [...new Set(rows.map((row) => row.author_id))];
      const authors = ids.length
        ? ((
            await supabase.from("profiles").select("id, full_name, email").in("id", ids)
          ).data ?? [])
        : [];
      return rows.map((row) => {
        const author = authors.find((a) => a.id === row.author_id);
        return { ...row, author: author?.full_name || author?.email || "Team member" };
      });
    },
  });

  const addComment = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("invoice_comments")
        .insert({ invoice_id: invoiceId, author_id: user!.id, body: comment.trim() });
      if (error) throw error;
    },
    onSuccess: async () => {
      setComment("");
      await queryClient.invalidateQueries({ queryKey: ["invoice-comments", invoiceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setStatus = useMutation({
    mutationFn: async (status: "draft" | "pending_approval") => {
      const { error } = await supabase
        .from("invoices")
        .update({
          status,
          submitted_at: status === "pending_approval" ? new Date().toISOString() : null,
        })
        .eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: async (_data, status) => {
      toast.success(
        status === "pending_approval"
          ? "Sent to the owner for approval."
          : "Invoice moved back to draft.",
      );
      await queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const approve = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("approve_invoice", { _invoice_id: invoiceId });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Approved. The customer can now see this invoice.");
      await queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Invoice deleted.");
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      navigate({ to: "/dashboard" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function download(path: string, name: string) {
    const { data, error } = await supabase.storage.from("invoice-files").createSignedUrl(path, 60);
    if (error || !data) {
      toast.error("Could not open that file.");
      return;
    }
    const link = document.createElement("a");
    link.href = data.signedUrl;
    link.download = name;
    link.target = "_blank";
    link.rel = "noopener";
    link.click();
  }

  if (!ready || isPending || invoice.isPending) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading invoice…</p>
      </AppShell>
    );
  }

  if (!role) return <Navigate to="/onboarding" replace />;

  if (!invoice.data) {
    return (
      <AppShell>
        <h1 className="text-2xl font-semibold">Invoice not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This invoice doesn't exist, or your role doesn't allow you to see it.
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/dashboard">Back to invoices</Link>
        </Button>
      </AppShell>
    );
  }

  const inv = invoice.data;
  const isInternal = role === "owner" || role === "staff" || role === "accountant";
  const canEdit =
    role === "owner" ||
    (role === "staff" && inv.status === "draft" && inv.created_by === user?.id);
  const canComment = role === "owner" || role === "accountant" || role === "staff";

  return (
    <AppShell>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All invoices
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">{inv.invoice_number}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {inv.customer_name} · {inv.customer_email} · {formatDate(inv.invoice_date)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={inv.status} />
          <p className="font-display text-2xl font-bold">{formatMoney(inv.total_amount)}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {canEdit && (
          <Button asChild variant="outline">
            <Link to="/invoices/$invoiceId/edit" params={{ invoiceId }}>
              Edit invoice
            </Link>
          </Button>
        )}
        {canEdit && inv.status === "draft" && (
          <Button onClick={() => setStatus.mutate("pending_approval")}>
            Send for owner approval
          </Button>
        )}
        {role === "owner" && inv.status === "pending_approval" && (
          <>
            <Button onClick={() => approve.mutate()}>Approve & send to customer</Button>
            <Button variant="outline" onClick={() => setStatus.mutate("draft")}>
              Send back to staff
            </Button>
          </>
        )}
        {role === "owner" && inv.status === "approved" && (
          <Button variant="outline" onClick={() => setStatus.mutate("draft")}>
            Reopen as draft
          </Button>
        )}
        {(role === "owner" || (role === "staff" && inv.status === "draft")) && (
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`Delete ${inv.invoice_number}? This cannot be undone.`)) {
                remove.mutate();
              }
            }}
          >
            <Trash2 className="size-4" /> {inv.status === "draft" ? "Delete draft" : "Delete invoice"}
          </Button>
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <section className="surface p-6">
            <h2 className="text-lg font-semibold">Items</h2>
            {(items.data ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No items on this invoice.</p>
            ) : (
              <table className="mt-4 w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-2">Item</th>
                    <th className="pb-2 text-right">Quantity</th>
                    <th className="pb-2 text-right">Rate (per unit)</th>
                    <th className="pb-2 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {(items.data ?? []).map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="py-2">{item.description}</td>
                      <td className="py-2 text-right tabular-nums">
                        {Number(item.quantity)} × 
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatMoney(item.unit_price)}
                      </td>
                      <td className="py-2 text-right font-medium tabular-nums">
                        {formatMoney(Number(item.quantity) * Number(item.unit_price))}
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {inv.notes && (
              <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
                {inv.notes}
              </p>
            )}
          </section>

          <section className="surface p-6">
            <h2 className="text-lg font-semibold">Attachments</h2>
            {(attachments.data ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No files attached.</p>
            ) : (
              <ul className="mt-4 space-y-2 text-sm">
                {(attachments.data ?? []).map((file) => (
                  <li key={file.id} className="flex items-center gap-2">
                    <Paperclip className="size-4 text-muted-foreground" />
                    <span className="flex-1">{file.file_name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => download(file.file_path, file.file_name)}
                    >
                      <Download className="size-4" /> Open
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {isInternal ? (
          <section className="surface flex h-fit flex-col p-6">
            <h2 className="text-lg font-semibold">Accountant & team comments</h2>
            <ul className="mt-4 space-y-4">
              {(comments.data ?? []).length === 0 && (
                <li className="text-sm text-muted-foreground">No comments yet.</li>
              )}
              {(comments.data ?? []).map((row) => (
                <li key={row.id} className="rounded-lg bg-muted p-3">
                  <p className="text-xs font-semibold">{row.author}</p>
                  <p className="mt-1 text-sm">{row.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(row.created_at)}</p>
                </li>
              ))}
            </ul>
            {canComment && (
              <div className="mt-4 space-y-2">
                <Textarea
                  rows={3}
                  value={comment}
                  placeholder="Add a comment for the owner…"
                  onChange={(event) => setComment(event.target.value)}
                />
                <Button
                  className="w-full"
                  disabled={!comment.trim() || addComment.isPending}
                  onClick={() => addComment.mutate()}
                >
                  Post comment
                </Button>
              </div>
            )}
          </section>
        ) : (
          <section className="surface h-fit p-6">
            <h2 className="text-lg font-semibold">Approved invoice</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Approved on {formatDate(inv.approved_at)} by the business owner.
            </p>
          </section>
        )}
      </div>
    </AppShell>
  );
}
