ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS image_path text;

CREATE POLICY "Users upload own request images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'request-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users read own request images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'request-images' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "Users delete own request images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'request-images' AND (storage.foldername(name))[1] = auth.uid()::text);