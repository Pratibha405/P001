import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, FileText, MessageSquare, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Invoice Hub — Invoice approvals for any small business" },
      {
        name: "description",
        content:
          "Create, review and approve invoices with your team. Staff draft, accountants comment, the owner approves, customers see the final invoice.",
      },
      { property: "og:title", content: "Invoice Hub — Invoice approvals for any small business" },
      {
        property: "og:description",
        content:
          "Role-based invoice management for any small business: staff draft, accountants comment, owners approve, customers view finalized invoices.",
      },
    ],
  }),
  component: Landing,
});

const roles = [
  {
    icon: ShieldCheck,
    title: "Business owner",
    body: "Full access to everything and the only person who can give final approval.",
  },
  {
    icon: FileText,
    title: "Staff member",
    body: "Creates invoices with items, quantities and receipts, then sends them up for approval.",
  },
  {
    icon: MessageSquare,
    title: "Accountant",
    body: "Reads every invoice and leaves comments. Never creates, edits or approves.",
  },
  {
    icon: Users,
    title: "Customer",
    body: "Signs in and sees only the finalized invoices addressed to them.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-lg font-bold tracking-tight">Invoice Hub</span>
        <Button asChild variant="outline">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pb-16 pt-8">
          <div className="hero-gradient overflow-hidden rounded-3xl px-8 py-16 text-sidebar-foreground sm:px-14">
            <p className="font-display text-xs uppercase tracking-[0.22em] text-sidebar-primary">
              Invoice workflow
            </p>
            <h1 className="mt-5 max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">
              Every invoice checked, commented on, and approved by you.
            </h1>
            <p className="mt-5 max-w-xl text-base text-sidebar-foreground/80">
              Built for small businesses of any kind — shops, studios, agencies and services. Your
              team drafts the paperwork, your accountant reviews it, and nothing reaches a customer
              until you approve it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="secondary">
                <Link to="/auth">Create your business</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent"
              >
                <Link to="/auth">I was invited</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20">
          <h2 className="text-2xl font-semibold">Four roles, clear boundaries</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {roles.map((role) => (
              <div key={role.title} className="surface p-6">
                <role.icon className="size-5 text-primary" aria-hidden />
                <h3 className="mt-4 text-base font-semibold">{role.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{role.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="surface grid gap-6 p-8 sm:grid-cols-3">
            {[
              { step: "1", title: "Drafted", body: "Staff add customer details, items and files." },
              {
                step: "2",
                title: "Awaiting approval",
                body: "The owner reads accountant comments and checks the totals.",
              },
              {
                step: "3",
                title: "Approved & sent",
                body: "The customer signs in and sees the final invoice.",
              },
            ].map((s) => (
              <div key={s.step}>
                <span className="font-display inline-flex size-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
                  {s.step}
                </span>
                <h3 className="mt-4 flex items-center gap-2 text-base font-semibold">
                  <CheckCircle2 className="size-4 text-success" aria-hidden />
                  {s.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        Invoice Hub — invoicing for small teams
      </footer>
    </div>
  );
}
