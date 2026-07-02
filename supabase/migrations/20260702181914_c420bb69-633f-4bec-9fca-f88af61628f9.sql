REVOKE ALL ON FUNCTION public.admin_update_user(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_blocked(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_soft_delete_user(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_update_user(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_blocked(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_user(uuid) TO authenticated, service_role;