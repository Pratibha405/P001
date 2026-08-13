CREATE OR REPLACE FUNCTION public.delete_business(_business_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = _business_id AND b.owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only the business owner can delete this business';
  END IF;
  DELETE FROM public.businesses WHERE id = _business_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_business(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_business(uuid) TO authenticated;