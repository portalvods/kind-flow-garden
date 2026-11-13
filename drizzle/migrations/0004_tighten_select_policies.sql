DROP POLICY IF EXISTS "Auth users read reviews" ON public.content_reviews;
CREATE POLICY "Users read own reviews or admin" ON public.content_reviews FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Auth users read comments" ON public.request_comments;
CREATE POLICY "Users read own comments or admin" ON public.request_comments FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Auth users read votes" ON public.request_votes;
CREATE POLICY "Users read own votes or admin" ON public.request_votes FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Anyone auth can read templates" ON public.message_templates;
CREATE POLICY "Admins read templates" ON public.message_templates FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.get_message_template(_key text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT content FROM public.message_templates WHERE key = _key AND auth.uid() IS NOT NULL LIMIT 1 $$;
REVOKE EXECUTE ON FUNCTION public.get_message_template(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_message_template(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Public read branding" ON storage.objects;
CREATE POLICY "Admins read branding" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'branding' AND public.has_role(auth.uid(),'admin'));