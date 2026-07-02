DROP POLICY IF EXISTS "Admins update profiles" ON public.profiles;
CREATE POLICY "Admins update profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(id uuid, full_name text, whatsapp text, email text, role app_role, blocked boolean, created_at timestamp with time zone)
LANGUAGE sql
STABLE
SECURITY INVOKER
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
    p.blocked,
    p.created_at
  FROM public.profiles p
  WHERE public.has_role(auth.uid(), 'admin')
    AND p.deleted_at IS NULL
  ORDER BY p.created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.is_blocked(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT blocked OR deleted_at IS NOT NULL FROM public.profiles WHERE id = _user_id), true)
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user(_user_id uuid, _full_name text, _whatsapp text, _email text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  UPDATE public.profiles
  SET
    full_name = NULLIF(btrim(COALESCE(_full_name, '')), ''),
    whatsapp = regexp_replace(COALESCE(_whatsapp, ''), '\D', '', 'g'),
    email = lower(NULLIF(btrim(COALESCE(_email, '')), '')),
    updated_at = now()
  WHERE id = _user_id
    AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_blocked(_user_id uuid, _blocked boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode bloquear a si mesmo.';
  END IF;

  UPDATE public.profiles
  SET blocked = COALESCE(_blocked, false), updated_at = now()
  WHERE id = _user_id
    AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_soft_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode excluir a si mesmo.';
  END IF;

  UPDATE public.profiles
  SET blocked = true, deleted_at = now(), deleted_by = auth.uid(), updated_at = now()
  WHERE id = _user_id
    AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_blocked(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_user(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_blocked(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_user(uuid) TO authenticated, service_role;