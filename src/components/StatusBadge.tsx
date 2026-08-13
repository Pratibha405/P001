import { STATUS_LABELS, type InvoiceStatus } from "@/lib/workspace";

const STYLES: Record<InvoiceStatus, string> = {
  draft: "bg-secondary text-secondary-foreground",
  pending_approval: "bg-warning text-warning-foreground",
  approved: "bg-success text-success-foreground",
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold " + STYLES[status]
      }
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
