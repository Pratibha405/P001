import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signOutAndRedirect, useBootstrapAccount, useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Create your business — Invoice Hub" },
      {
        name: "description",
        content: "Set up your business workspace and start inviting your team.",
      },
      { property: "og:title", content: "Create your business — Invoice Hub" },
      { property: "og:description", content: "Set up a business workspace for invoice approvals." },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const ready = useBootstrapAccount();
  const { memberships, isPending } = useWorkspace();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (ready && !isPending && memberships.length > 0) return <Navigate to="/dashboard" replace />;

  async function createBusiness() {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.rpc("create_business", { _name: name.trim() });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["memberships"] });
    toast.success("Business created. You are the owner.");
    navigate({ to: "/team" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="surface w-full max-w-md p-8">
        <h1 className="text-2xl font-semibold">Set up your business</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You are not part of a business yet. Create one to become its owner, or ask the owner to
          invite the email address you signed up with.
        </p>
        <div className="mt-6 space-y-2">
          <Label htmlFor="business_name">Business name</Label>
          <Input
            id="business_name"
            value={name}
            placeholder="Acme Studio"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <Button className="mt-6 w-full" disabled={saving} onClick={createBusiness}>
          Create business
        </Button>
        <Button className="mt-2 w-full" variant="ghost" onClick={signOutAndRedirect}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
