-- ROLES
CREATE TYPE public.app_role AS ENUM ('owner','staff','accountant','customer');
CREATE TYPE public.invoice_status AS ENUM ('draft','pending_approval','approved');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- BUSINESSES
CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.businesses TO authenticated;
GRANT ALL ON public.businesses TO service_role;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- MEMBERSHIPS
CREATE TABLE public.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);
GRANT SELECT, DELETE ON public.memberships TO authenticated;
GRANT ALL ON public.memberships TO service_role;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

-- INVITATIONS
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.app_role NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX invitations_pending_unique ON public.invitations (business_id, lower(email)) WHERE accepted_at IS NULL;
GRANT SELECT, INSERT, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- INVOICES
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  invoice_date DATE NOT NULL DEFAULT current_date,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.invoice_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.invoice_comments TO authenticated;
GRANT ALL ON public.invoice_comments TO service_role;
ALTER TABLE public.invoice_comments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.invoice_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.invoice_attachments TO authenticated;
GRANT ALL ON public.invoice_attachments TO service_role;
ALTER TABLE public.invoice_attachments ENABLE ROW LEVEL SECURITY;

-- HELPERS
CREATE OR REPLACE FUNCTION public.current_email()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT lower(coalesce((SELECT email FROM public.profiles WHERE id = auth.uid()), (auth.jwt() ->> 'email'))) $$;

CREATE OR REPLACE FUNCTION public.has_business_role(_business_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.memberships m WHERE m.business_id = _business_id AND m.user_id = auth.uid() AND m.role = _role) $$;

CREATE OR REPLACE FUNCTION public.is_business_member(_business_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.memberships m WHERE m.business_id = _business_id AND m.user_id = auth.uid()) $$;

CREATE OR REPLACE FUNCTION public.is_business_internal(_business_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.memberships m WHERE m.business_id = _business_id AND m.user_id = auth.uid() AND m.role IN ('owner','staff','accountant')) $$;

CREATE OR REPLACE FUNCTION public.can_view_invoice(_invoice_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = _invoice_id
      AND (
        public.is_business_internal(i.business_id)
        OR (i.status = 'approved' AND public.has_business_role(i.business_id,'customer') AND lower(i.customer_email) = public.current_email())
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_edit_invoice(_invoice_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = _invoice_id
      AND (
        public.has_business_role(i.business_id,'owner')
        OR (public.has_business_role(i.business_id,'staff') AND i.status <> 'approved')
      )
  )
$$;

-- create business (owner signup)
CREATE OR REPLACE FUNCTION public.create_business(_name TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE new_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.businesses (name, owner_id) VALUES (_name, auth.uid()) RETURNING id INTO new_id;
  INSERT INTO public.memberships (business_id, user_id, role) VALUES (new_id, auth.uid(), 'owner');
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_business(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_business(TEXT) TO authenticated;

-- accept pending invitations for the signed-in user's email
CREATE OR REPLACE FUNCTION public.accept_my_invitations()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n INTEGER := 0; inv RECORD; my_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  my_email := public.current_email();
  IF my_email IS NULL THEN RETURN 0; END IF;
  FOR inv IN SELECT * FROM public.invitations WHERE accepted_at IS NULL AND lower(email) = my_email LOOP
    INSERT INTO public.memberships (business_id, user_id, role)
    VALUES (inv.business_id, auth.uid(), inv.role)
    ON CONFLICT (business_id, user_id) DO UPDATE SET role = EXCLUDED.role;
    UPDATE public.invitations SET accepted_at = now() WHERE id = inv.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_my_invitations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_my_invitations() TO authenticated;

-- approve invoice (owner only)
CREATE OR REPLACE FUNCTION public.approve_invoice(_invoice_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE inv RECORD;
BEGIN
  SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id;
  IF inv IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF NOT public.has_business_role(inv.business_id, 'owner') THEN RAISE EXCEPTION 'Only the business owner can approve invoices'; END IF;
  UPDATE public.invoices SET status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now() WHERE id = _invoice_id;
END;
$$;
REVOKE ALL ON FUNCTION public.approve_invoice(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_invoice(UUID) TO authenticated;

-- guard: only owner may set/unset approved status via direct updates
CREATE OR REPLACE FUNCTION public.guard_invoice_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status <> OLD.status AND (NEW.status = 'approved' OR OLD.status = 'approved') THEN
    IF NOT public.has_business_role(OLD.business_id, 'owner') THEN
      RAISE EXCEPTION 'Only the business owner can approve or reopen invoices';
    END IF;
  END IF;
  NEW.business_id := OLD.business_id;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER invoices_guard_update BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_update();

-- POLICIES
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR EXISTS (
  SELECT 1 FROM public.memberships a JOIN public.memberships b ON a.business_id = b.business_id
  WHERE a.user_id = auth.uid() AND a.role IN ('owner','staff','accountant') AND b.user_id = public.profiles.id));
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "members read business" ON public.businesses FOR SELECT TO authenticated USING (public.is_business_member(id));
CREATE POLICY "create own business" ON public.businesses FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "owner updates business" ON public.businesses FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "read memberships in my businesses" ON public.memberships FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_business_internal(business_id));
CREATE POLICY "owner removes members" ON public.memberships FOR DELETE TO authenticated
USING (public.has_business_role(business_id,'owner') AND user_id <> auth.uid());

CREATE POLICY "owner reads invitations" ON public.invitations FOR SELECT TO authenticated
USING (public.has_business_role(business_id,'owner') OR lower(email) = public.current_email());
CREATE POLICY "owner creates invitations" ON public.invitations FOR INSERT TO authenticated
WITH CHECK (public.has_business_role(business_id,'owner') AND invited_by = auth.uid());
CREATE POLICY "owner deletes invitations" ON public.invitations FOR DELETE TO authenticated
USING (public.has_business_role(business_id,'owner'));

CREATE POLICY "read invoices" ON public.invoices FOR SELECT TO authenticated
USING (public.is_business_internal(business_id)
  OR (status = 'approved' AND public.has_business_role(business_id,'customer') AND lower(customer_email) = public.current_email()));
CREATE POLICY "staff and owner create invoices" ON public.invoices FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND (public.has_business_role(business_id,'owner') OR public.has_business_role(business_id,'staff')));
CREATE POLICY "staff and owner update invoices" ON public.invoices FOR UPDATE TO authenticated
USING (public.has_business_role(business_id,'owner') OR (public.has_business_role(business_id,'staff') AND status <> 'approved'))
WITH CHECK (public.has_business_role(business_id,'owner') OR public.has_business_role(business_id,'staff'));
CREATE POLICY "owner deletes invoices" ON public.invoices FOR DELETE TO authenticated
USING (public.has_business_role(business_id,'owner') OR (public.has_business_role(business_id,'staff') AND status = 'draft' AND created_by = auth.uid()));

CREATE POLICY "read invoice items" ON public.invoice_items FOR SELECT TO authenticated USING (public.can_view_invoice(invoice_id));
CREATE POLICY "write invoice items" ON public.invoice_items FOR INSERT TO authenticated WITH CHECK (public.can_edit_invoice(invoice_id));
CREATE POLICY "update invoice items" ON public.invoice_items FOR UPDATE TO authenticated USING (public.can_edit_invoice(invoice_id)) WITH CHECK (public.can_edit_invoice(invoice_id));
CREATE POLICY "delete invoice items" ON public.invoice_items FOR DELETE TO authenticated USING (public.can_edit_invoice(invoice_id));

CREATE POLICY "read invoice comments" ON public.invoice_comments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND public.is_business_internal(i.business_id)));
CREATE POLICY "internal team comments" ON public.invoice_comments FOR INSERT TO authenticated
WITH CHECK (author_id = auth.uid() AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id
  AND (public.has_business_role(i.business_id,'owner') OR public.has_business_role(i.business_id,'accountant') OR public.has_business_role(i.business_id,'staff'))));
CREATE POLICY "delete own comment" ON public.invoice_comments FOR DELETE TO authenticated USING (author_id = auth.uid());

CREATE POLICY "read attachments" ON public.invoice_attachments FOR SELECT TO authenticated USING (public.can_view_invoice(invoice_id));
CREATE POLICY "add attachments" ON public.invoice_attachments FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid() AND public.can_edit_invoice(invoice_id));
CREATE POLICY "delete attachments" ON public.invoice_attachments FOR DELETE TO authenticated USING (public.can_edit_invoice(invoice_id));
