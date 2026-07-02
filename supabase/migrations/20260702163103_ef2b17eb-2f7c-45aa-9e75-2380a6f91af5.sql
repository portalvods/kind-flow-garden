
DROP POLICY IF EXISTS "Anyone can read settings" ON public.site_settings;
CREATE POLICY "Public read non-secret settings"
ON public.site_settings
FOR SELECT
TO anon, authenticated
USING (key NOT LIKE 'evolution_%');

CREATE POLICY "Admins read all settings"
ON public.site_settings
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
