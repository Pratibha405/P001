CREATE POLICY "invoice files read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'invoice-files' AND public.can_view_invoice(((storage.foldername(name))[1])::uuid));
CREATE POLICY "invoice files insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'invoice-files' AND public.can_edit_invoice(((storage.foldername(name))[1])::uuid));
CREATE POLICY "invoice files delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'invoice-files' AND public.can_edit_invoice(((storage.foldername(name))[1])::uuid));