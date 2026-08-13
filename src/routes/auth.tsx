import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const searchSchema = z.object({
  next: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — Invoice Hub Invoices" },
      {
        name: "description",
        content:
          "Sign in or create an account to manage Invoice Hub invoices as an owner, staff member, accountant or customer.",
      },
      { property: "og:title", content: "Sign in — Invoice Hub Invoices" },
      {
        property: "og:description",
        content: "Access your business invoices with your team role.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = useSearch({ from: "/auth" });
  const [loading, setLoading] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null);

  const destination = next && next.startsWith("/") ? next : "/dashboard";

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: destination, replace: true });
    });
  }, [destination, navigate]);

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email")).trim(),
      password: String(form.get("password")),
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: destination, replace: true });
  }

  async function handleSignUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password: String(form.get("password")),
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: String(form.get("full_name")).trim() },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      setPendingConfirm(email);
      return;
    }
    navigate({ to: destination, replace: true });
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: destination, replace: true });
  }

  if (pendingConfirm) {
    return (
      <Centered>
        <h1 className="text-2xl font-semibold">Confirm your email</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          We sent a confirmation link to <span className="font-medium">{pendingConfirm}</span>. Open
          it to finish creating your account, then come back and sign in.
        </p>
        <Button className="mt-6 w-full" variant="outline" onClick={() => setPendingConfirm(null)}>
          Back to sign in
        </Button>
      </Centered>
    );
  }

  return (
    <Centered>
      <h1 className="text-2xl font-semibold">Invoice Hub</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Owners create a business. Everyone else joins with the email address they were invited with.
      </p>

      <Tabs defaultValue="signin" className="mt-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">Sign in</TabsTrigger>
          <TabsTrigger value="signup">Create account</TabsTrigger>
        </TabsList>

        <TabsContent value="signin">
          <form className="space-y-4" onSubmit={handleSignIn}>
            <Field label="Email" name="email" type="email" />
            <Field label="Password" name="password" type="password" />
            <Button type="submit" className="w-full" disabled={loading}>
              Sign in
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="signup">
          <form className="space-y-4" onSubmit={handleSignUp}>
            <Field label="Full name" name="full_name" type="text" />
            <Field label="Email" name="email" type="email" />
            <Field label="Password" name="password" type="password" minLength={6} />
            <Button type="submit" className="w-full" disabled={loading}>
              Create account
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button variant="outline" className="w-full" onClick={handleGoogle}>
        Continue with Google
      </Button>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="surface w-full max-w-md p-8">{children}</div>
    </div>
  );
}

function Field({
  label,
  name,
  type,
  minLength,
}: {
  label: string;
  name: string;
  type: string;
  minLength?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required minLength={minLength} autoComplete="on" />
    </div>
  );
}
