import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signOutAndRedirect, useCurrentUser } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Account settings — Invoice Hub" },
      {
        name: "description",
        content: "Update the name and email address used to sign in to your Invoice Hub account.",
      },
      { property: "og:title", content: "Account settings — Invoice Hub" },
      {
        property: "og:description",
        content: "Change your account name and login email address.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setEmail(user.email ?? "");
    setFullName((user.user_metadata?.["full_name"] as string) ?? "");
  }, [user]);

  async function save() {
    if (!user) return;
    const nextEmail = email.trim().toLowerCase();
    const nextName = fullName.trim();
    if (!nextEmail) {
      toast.error("Email address is required.");
      return;
    }
    setSaving(true);
    const emailChanged = nextEmail !== (user.email ?? "").toLowerCase();

    const { error: authError } = await supabase.auth.updateUser({
      ...(emailChanged ? { email: nextEmail } : {}),
      data: { full_name: nextName },
    });
    if (authError) {
      setSaving(false);
      toast.error(authError.message);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ email: nextEmail, full_name: nextName })
      .eq("id", user.id);
    setSaving(false);
    if (profileError) {
      toast.error(profileError.message);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["auth-user"] });

    if (emailChanged) {
      toast.success("Email updated. Sign in again with your new address.");
      setTimeout(() => {
        void signOutAndRedirect();
      }, 1200);
      return;
    }
    toast.success("Account updated.");
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-semibold">Account settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Change your name and the email address you use to sign in. Once the email is updated, only
          the new address can access this account — the old one stops working immediately.
        </p>

        <div className="surface mt-6 space-y-5 p-6">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email address (used to sign in)</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@corollawings.com"
            />
          </div>
          <Button className="w-full" disabled={saving || !user} onClick={save}>
            Save changes
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
