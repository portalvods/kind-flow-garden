CREATE OR REPLACE FUNCTION public.normalize_phone(_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = 'public'
AS $$
  SELECT
    CASE
      WHEN digits IS NULL OR digits = '' THEN ''
      WHEN length(digits) > 11 THEN digits
      WHEN length(digits) IN (10, 11) THEN '55' || digits
      ELSE digits
    END
  FROM (SELECT regexp_replace(coalesce(_phone, ''), '\D', '', 'g') AS digits) AS cleaned;
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_exists(_whatsapp text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE whatsapp = public.normalize_phone(coalesce(_whatsapp, ''))
      AND deleted_at IS NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.email_by_whatsapp(_whatsapp text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT email
  FROM public.profiles
  WHERE whatsapp = public.normalize_phone(coalesce(_whatsapp, ''))
    AND deleted_at IS NULL
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.request_wa_password_reset(
  _whatsapp text,
  _code_hash text,
  _token_hash text,
  _ttl_seconds integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  _uid uuid;
  _phone text := public.normalize_phone(coalesce(_whatsapp,''));
BEGIN
  IF length(_phone) < 10 THEN
    RAISE EXCEPTION 'WhatsApp inválido.';
  END IF;

  SELECT id INTO _uid FROM public.profiles
    WHERE whatsapp = _phone AND deleted_at IS NULL
    LIMIT 1;

  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Nenhuma conta encontrada com esse WhatsApp.';
  END IF;

  IF (SELECT count(*) FROM public.password_resets
        WHERE whatsapp = _phone AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'Muitas solicitações. Aguarde alguns minutos.';
  END IF;

  INSERT INTO public.password_resets (user_id, whatsapp, code_hash, token_hash, expires_at)
    VALUES (_uid, _phone, _code_hash, _token_hash, now() + make_interval(secs => _ttl_seconds));
END $function$;

CREATE OR REPLACE FUNCTION public.admin_update_user(
  _user_id uuid,
  _full_name text,
  _whatsapp text,
  _email text
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  UPDATE public.profiles
  SET
    full_name = NULLIF(btrim(COALESCE(_full_name, '')), ''),
    whatsapp = public.normalize_phone(COALESCE(_whatsapp, '')),
    email = lower(NULLIF(btrim(COALESCE(_email, '')), '')),
    updated_at = now()
  WHERE id = _user_id
    AND deleted_at IS NULL;
END $function$;

-- Normaliza os números já existentes para garantir que o banco fique consistente
-- (apenas quando o resultado tiver 12+ dígitos e parecer um número brasileiro).
UPDATE public.profiles
SET whatsapp = public.normalize_phone(whatsapp)
WHERE deleted_at IS NULL
  AND length(regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g')) IN (10, 11);
