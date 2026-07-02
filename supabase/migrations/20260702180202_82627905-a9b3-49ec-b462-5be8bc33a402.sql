
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE OR REPLACE FUNCTION public.admin_list_users()
 RETURNS TABLE(id uuid, full_name text, whatsapp text, email text, role app_role, blocked boolean, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id,
    p.full_name,
    p.whatsapp,
    p.email,
    COALESCE(
      (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = p.id ORDER BY (ur.role = 'admin') DESC LIMIT 1),
      'cliente'::app_role
    ) AS role,
    p.blocked,
    p.created_at
  FROM public.profiles p
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY p.created_at DESC
$function$;

CREATE OR REPLACE FUNCTION public.is_blocked(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT blocked FROM public.profiles WHERE id = _user_id), false)
$function$;

GRANT EXECUTE ON FUNCTION public.is_blocked(uuid) TO anon, authenticated;
