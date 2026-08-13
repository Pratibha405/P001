import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Paperclip, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, type Invoice } from "@/lib/workspace";

export type ItemDraft = {
  key: string;
  description: string;
  quantity: string;
  unit_price: string;
};

export type ExistingAttachment = { id: string; file_name: string; file_path: string };

const newItem = (): ItemDraft => ({
  key: crypto.randomUUID(),
  description: "",
  quantity: "1",
  unit_price: "0",
});

function makeInvoiceNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `CW-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function InvoiceForm({
  businessId,
  userId,
  invoice,
  initialItems,
  existingAttachments = [],
  canSubmit,
}: {
  businessId: string;
  userId: string;
  invoice?: Invoice;
  initialItems?: ItemDraft[];
  existingAttachments?: ExistingAttachment[];
  canSubmit: boolean;
}) {
  const navigate = useNavigate();
  const [customerName, setCustomerName] = useState(invoice?.customer_name ?? "");
  const [customerEmail, setCustomerEmail] = useState(invoice?.customer_email ?? "");
  const [invoiceDate, setInvoiceDate] = useState(
    invoice?.invoice_date ?? new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [items, setItems] = useState<ItemDraft[]>(
    initialItems && initialItems.length > 0 ? initialItems : [newItem()],
  );
  const [totalTouched, setTotalTouched] = useState(Boolean(invoice));
  const [total, setTotal] = useState(invoice ? String(invoice.total_amount) : "0");
  const [files, setFiles] = useState<File[]>([]);
  const [removedAttachments, setRemovedAttachments] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const computedTotal = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
        0,
      ),
    [items],
  );

  function updateItem(key: string, patch: Partial<ItemDraft>) {
    setItems((current) => {
      const next = current.map((item) => (item.key === key ? { ...item, ...patch } : item));
      if (!totalTouched) {
        const sum = next.reduce(
          (acc, item) => acc + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
          0,
        );
        setTotal(sum.toFixed(2));
      }
      return next;
    });
  }

  async function persist(status: "draft" | "pending_approval") {
    if (!customerName.trim() || !customerEmail.trim()) {
      toast.error("Customer name and email are required.");
      return;
    }
    setSaving(true);
    try {
      let invoiceId = invoice?.id;

      if (invoiceId) {
        const { error } = await supabase
          .from("invoices")
          .update({
            customer_name: customerName.trim(),
            customer_email: customerEmail.trim().toLowerCase(),
            invoice_date: invoiceDate,
            total_amount: Number(total) || 0,
            notes,
            status,
            submitted_at: status === "pending_approval" ? new Date().toISOString() : null,
          })
          .eq("id", invoiceId);
        if (error) throw error;
        await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
      } else {
        const { data, error } = await supabase
          .from("invoices")
          .insert({
            business_id: businessId,
            invoice_number: makeInvoiceNumber(),
            customer_name: customerName.trim(),
            customer_email: customerEmail.trim().toLowerCase(),
            invoice_date: invoiceDate,
            total_amount: Number(total) || 0,
            notes,
            status,
            created_by: userId,
            submitted_at: status === "pending_approval" ? new Date().toISOString() : null,
          })
          .select("id")
          .single();
        if (error) throw error;
        invoiceId = data.id;
      }

      const rows = items
        .filter((item) => item.description.trim().length > 0)
        .map((item) => ({
          invoice_id: invoiceId!,
          description: item.description.trim(),
          quantity: Number(item.quantity) || 0,
          unit_price: Number(item.unit_price) || 0,
        }));
      if (rows.length > 0) {
        const { error } = await supabase.from("invoice_items").insert(rows);
        if (error) throw error;
      }

      if (removedAttachments.length > 0) {
        const removed = existingAttachments.filter((a) => removedAttachments.includes(a.id));
        await supabase.storage
          .from("invoice-files")
          .remove(removed.map((a) => a.file_path))
          .catch(() => undefined);
        await supabase
          .from("invoice_attachments")
          .delete()
          .in("id", removedAttachments);
      }

      for (const file of files) {
        const path = `${invoiceId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
        const upload = await supabase.storage.from("invoice-files").upload(path, file);
        if (upload.error) throw upload.error;
        const { error } = await supabase.from("invoice_attachments").insert({
          invoice_id: invoiceId!,
          file_path: path,
          file_name: file.name,
          uploaded_by: userId,
        });
        if (error) throw error;
      }

      toast.success(
        status === "pending_approval"
          ? "Invoice sent to the business owner for approval."
          : "Invoice saved as a draft.",
      );
      navigate({ to: "/invoices/$invoiceId", params: { invoiceId: invoiceId! } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the invoice.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="surface space-y-5 p-6">
        <h2 className="text-lg font-semibold">Customer & date</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="customer_name">Customer name</Label>
            <Input
              id="customer_name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer_email">Customer email</Label>
            <Input
              id="customer_email"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The customer sees this invoice once approved, using this email to sign in.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invoice_date">Invoice date</Label>
            <Input
              id="invoice_date"
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="total">Total amount</Label>
            <Input
              id="total"
              type="number"
              step="0.01"
              min="0"
              value={total}
              onChange={(e) => {
                setTotalTouched(true);
                setTotal(e.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Items add up to {formatMoney(computedTotal)}.
            </p>
          </div>
        </div>
      </div>

      <div className="surface space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Items</h2>
          <Button variant="outline" size="sm" onClick={() => setItems((c) => [...c, newItem()])}>
            <Plus className="size-4" /> Add item
          </Button>
        </div>
        <div className="space-y-3">
          <div className="hidden gap-3 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[1fr_7rem_9rem_auto]">
            <span>Item description</span>
            <span>Quantity</span>
            <span>Rate (per unit)</span>
            <span className="w-9" aria-hidden />
          </div>
          {items.map((item) => (
            <div key={item.key} className="grid gap-3 sm:grid-cols-[1fr_7rem_9rem_auto]">
              <Input
                aria-label="Item description"
                placeholder="Wings frame, resin helmet…"
                value={item.description}
                onChange={(e) => updateItem(item.key, { description: e.target.value })}
              />
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground sm:hidden">Quantity</span>
                <Input
                  aria-label="Quantity"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Qty"
                  value={item.quantity}
                  onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground sm:hidden">
                  Rate (per unit)
                </span>
                <Input
                  aria-label="Rate per unit"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Rate"
                  value={item.unit_price}
                  onChange={(e) => updateItem(item.key, { unit_price: e.target.value })}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove item"
                onClick={() => setItems((c) => c.filter((i) => i.key !== item.key))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Line total = Quantity × Rate. The invoice total adds up every line.
          </p>
        </div>

      </div>

      <div className="surface space-y-4 p-6">
        <h2 className="text-lg font-semibold">Attachments & notes</h2>
        {existingAttachments.length > 0 && (
          <ul className="space-y-2 text-sm">
            {existingAttachments.map((attachment) => (
              <li key={attachment.id} className="flex items-center gap-2">
                <Paperclip className="size-4 text-muted-foreground" />
                <span
                  className={
                    removedAttachments.includes(attachment.id)
                      ? "line-through text-muted-foreground"
                      : ""
                  }
                >
                  {attachment.file_name}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setRemovedAttachments((current) =>
                      current.includes(attachment.id)
                        ? current.filter((id) => id !== attachment.id)
                        : [...current, attachment.id],
                    )
                  }
                >
                  {removedAttachments.includes(attachment.id) ? "Keep" : "Remove"}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2">
          <Label htmlFor="files">Attach receipts or files</Label>
          <Input
            id="files"
            type="file"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          {files.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {files.length} file{files.length > 1 ? "s" : ""} ready to upload.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Notes for the owner</Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={saving} onClick={() => persist("draft")}>
          Save draft
        </Button>
        {canSubmit && (
          <Button disabled={saving} onClick={() => persist("pending_approval")}>
            Send for owner approval
          </Button>
        )}
      </div>
    </div>
  );
}
