
CREATE OR REPLACE FUNCTION public.whatsapp_exists(_whatsapp text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE whatsapp = regexp_replace(coalesce(_whatsapp, ''), '\D', '', 'g')
      AND deleted_at IS NULL
  )
$function$;

CREATE OR REPLACE FUNCTION public.email_by_whatsapp(_whatsapp text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT email
  FROM public.profiles
  WHERE whatsapp = regexp_replace(coalesce(_whatsapp, ''), '\D', '', 'g')
    AND deleted_at IS NULL
  LIMIT 1
$function$;

-- Also scramble whatsapp/email on soft delete to fully free them for reuse
CREATE OR REPLACE FUNCTION public.admin_soft_delete_user(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode excluir a si mesmo.';
  END IF;

  UPDATE public.profiles
  SET
    blocked = true,
    deleted_at = now(),
    deleted_by = auth.uid(),
    whatsapp = 'deleted_' || _user_id::text || '_' || COALESCE(whatsapp, ''),
    email = 'deleted_' || _user_id::text || '_' || COALESCE(email, ''),
    updated_at = now()
  WHERE id = _user_id
    AND deleted_at IS NULL;
END;
$function$;
