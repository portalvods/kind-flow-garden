CREATE POLICY "Block direct otp code access" ON public.otp_codes
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

REVOKE EXECUTE ON FUNCTION public.email_from_whatsapp(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_catalog_availability(bigint, text, integer, text) FROM anon, authenticated, PUBLIC;