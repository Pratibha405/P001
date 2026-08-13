import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ROLE_LABELS,
  clearActiveBusiness,
  formatDate,
  useBootstrapAccount,
  useCurrentUser,
  useWorkspace,
  type AppRole,
} from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team & invitations — Invoice Hub" },
      {
        name: "description",
        content: "Invite staff, accountants and customers, and manage their roles.",
      },
      { property: "og:title", content: "Team & invitations — Invoice Hub" },
      { property: "og:description", content: "Manage who can access your business workspace." },
    ],
  }),
  component: Team,
});

const INVITE_ROLES: AppRole[] = ["staff", "accountant", "customer", "owner"];

function Team() {
  const ready = useBootstrapAccount();
  const { data: user } = useCurrentUser();
  const { membership, role, isPending, business } = useWorkspace();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("staff");
  const [confirmName, setConfirmName] = useState("");


  const businessId = membership?.business_id;

  const members = useQuery({
    queryKey: ["members", businessId],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("id, role, user_id, created_at, profiles(full_name, email)")
        .eq("business_id", businessId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        role: AppRole;
        user_id: string;
        created_at: string;
        profiles: { full_name: string | null; email: string } | null;
      }[];
    },
  });

  const invites = useQuery({
    queryKey: ["invitations", businessId],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("id, email, role, accepted_at, created_at")
        .eq("business_id", businessId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("invitations").insert({
        business_id: businessId!,
        email: email.trim().toLowerCase(),
        role: inviteRole,
        invited_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(`Invitation created for ${email.trim()}.`);
      setEmail("");
      await queryClient.invalidateQueries({ queryKey: ["invitations", businessId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invitations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["invitations", businessId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changeRole = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: AppRole }) => {
      const { error } = await supabase.from("memberships").update({ role: next }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Role updated.");
      await queryClient.invalidateQueries({ queryKey: ["members", businessId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("memberships").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["members", businessId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteBusiness = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("delete_business", {
        _business_id: businessId!,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      clearActiveBusiness();
      toast.success("Business deleted.");
      window.location.href = "/dashboard";
    },
    onError: (error: Error) => toast.error(error.message),
  });


  if (!ready || isPending) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading team…</p>
      </AppShell>
    );
  }

  if (!membership) return <Navigate to="/onboarding" replace />;
  if (role !== "owner") return <Navigate to="/dashboard" replace />;

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold">Team & invitations</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Invite people to {business?.name}. They join automatically with the role you choose once
        they sign up with the invited email address.
      </p>

      <section className="surface mt-6 p-6">
        <h2 className="text-lg font-semibold">Invite someone</h2>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1 space-y-2">
            <Label htmlFor="invite_email">Email address</Label>
            <Input
              id="invite_email"
              type="email"
              value={email}
              placeholder="name@example.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite_role">Role</Label>
            <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as AppRole)}>
              <SelectTrigger id="invite_role" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVITE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button disabled={!email.trim() || invite.isPending} onClick={() => invite.mutate()}>
            Send invitation
          </Button>
        </div>
      </section>

      <section className="surface mt-6 p-6">
        <h2 className="text-lg font-semibold">Members</h2>
        <ul className="mt-4 divide-y divide-border">
          {(members.data ?? []).map((member) => (
            <li key={member.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-56 flex-1">
                <p className="text-sm font-medium">
                  {member.profiles?.full_name || member.profiles?.email}
                </p>
                <p className="text-xs text-muted-foreground">{member.profiles?.email}</p>
              </div>
              <Select
                value={member.role}
                onValueChange={(value) =>
                  changeRole.mutate({ id: member.id, next: value as AppRole })
                }
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVITE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => removeMember.mutate(member.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="surface mt-6 p-6">
        <h2 className="text-lg font-semibold">Pending invitations</h2>
        {(invites.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No invitations yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {(invites.data ?? []).map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="min-w-56 flex-1">{row.email}</span>
                <span className="text-muted-foreground">{ROLE_LABELS[row.role as AppRole]}</span>
                <span className="text-xs text-muted-foreground">
                  {row.accepted_at ? `Joined ${formatDate(row.accepted_at)}` : "Pending"}
                </span>
                {!row.accepted_at && (
                  <Button variant="ghost" size="sm" onClick={() => revoke.mutate(row.id)}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="surface mt-6 border-destructive/40 p-6">
        <h2 className="text-lg font-semibold text-destructive">Delete this business</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Permanently deletes {business?.name} with all its invoices, items, comments,
          attachments, members and invitations. This cannot be undone.
        </p>
        <AlertDialog onOpenChange={() => setConfirmName("")}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="mt-4">
              Delete business
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {business?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Type the business name to confirm. Everything belonging to it will be removed for
                every member and customer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Label htmlFor="confirm_name">Business name</Label>
              <Input
                id="confirm_name"
                value={confirmName}
                placeholder={business?.name ?? ""}
                onChange={(event) => setConfirmName(event.target.value)}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={
                  confirmName.trim() !== (business?.name ?? "") || deleteBusiness.isPending
                }
                onClick={(event) => {
                  event.preventDefault();
                  deleteBusiness.mutate();
                }}
              >
                Delete permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </AppShell>

  );
}
