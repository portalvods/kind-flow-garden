REVOKE ALL ON FUNCTION public.whatsapp_exists(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_exists(text) TO service_role;