
-- Admin: list all registered users (only admins can call this)
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid,
  full_name text,
  whatsapp text,
  email text,
  role app_role,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    p.whatsapp,
    p.email,
    COALESCE(
      (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = p.id ORDER BY (ur.role = 'admin') DESC LIMIT 1),
      'cliente'::app_role
    ) AS role,
    p.created_at
  FROM public.profiles p
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY p.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated, service_role;

-- Password reset: look up email by whatsapp (restricted to server via service_role)
CREATE OR REPLACE FUNCTION public.email_by_whatsapp(_whatsapp text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email
  FROM public.profiles
  WHERE whatsapp = regexp_replace(coalesce(_whatsapp, ''), '\D', '', 'g')
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.email_by_whatsapp(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_by_whatsapp(text) TO service_role;
