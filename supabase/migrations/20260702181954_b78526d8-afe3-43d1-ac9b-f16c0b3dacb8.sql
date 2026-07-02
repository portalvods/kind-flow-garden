REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_blocked(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_blocked(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.whatsapp_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_exists(text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.email_by_whatsapp(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_by_whatsapp(text) TO anon, authenticated, service_role;