import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "owner" | "staff" | "accountant" | "customer";
export type InvoiceStatus = "draft" | "pending_approval" | "approved";

export type Membership = {
  id: string;
  role: AppRole;
  business_id: string;
  businesses: { id: string; name: string } | null;
};

export type Invoice = {
  id: string;
  business_id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string;
  invoice_date: string;
  total_amount: number;
  status: InvoiceStatus;
  notes: string;
  created_by: string;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
};

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Business owner",
  staff: "Staff member",
  accountant: "Accountant",
  customer: "Customer",
};

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  pending_approval: "Awaiting approval",
  approved: "Approved & sent",
};

export function formatMoney(value: number | string) {
  const n = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number.isFinite(n) ? n : 0,
  );
}

export function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const ACTIVE_KEY = "cw.active_business";

export function useCurrentUser() {
  return useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user ?? null;
    },
  });
}

export function useMemberships() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["memberships", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("id, role, business_id, businesses(id, name)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []) as unknown as Membership[];
    },
  });
}

/** Ensures a profile row exists and claims any pending invitations for this email. */
export function useBootstrapAccount() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        await supabase.from("profiles").upsert(
          {
            id: user.id,
            email: user.email ?? "",
            full_name: (user.user_metadata?.["full_name"] as string) ?? "",
          },
          { onConflict: "id" },
        );
        const { data } = await supabase.rpc("accept_my_invitations");
        if (!cancelled && (data ?? 0) > 0) {
          await queryClient.invalidateQueries({ queryKey: ["memberships"] });
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, queryClient]);

  return ready;
}

export function useWorkspace() {
  const { data: memberships, isPending } = useMemberships();
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") setActiveId(window.localStorage.getItem(ACTIVE_KEY));
  }, []);

  const select = useCallback((businessId: string) => {
    window.localStorage.setItem(ACTIVE_KEY, businessId);
    setActiveId(businessId);
  }, []);

  const list = memberships ?? [];
  const active = list.find((m) => m.business_id === activeId) ?? list[0] ?? null;

  return {
    isPending,
    memberships: list,
    membership: active,
    role: (active?.role ?? null) as AppRole | null,
    business: active?.businesses ?? null,
    selectBusiness: select,
  };
}

export function clearActiveBusiness() {
  if (typeof window !== "undefined") window.localStorage.removeItem(ACTIVE_KEY);
}

export async function signOutAndRedirect() {
  await supabase.auth.signOut();
  window.localStorage.removeItem(ACTIVE_KEY);
  window.location.href = "/auth";
}

