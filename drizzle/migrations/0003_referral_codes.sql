-- Short referral codes for resellers (nice links like /r/ABC12XYZ)
ALTER TABLE public.user_roles ADD COLUMN referral_code text;

CREATE UNIQUE INDEX user_roles_referral_code_unique
  ON public.user_roles(referral_code)
  WHERE referral_code IS NOT NULL;

-- Logged-in reseller gets (or creates) their referral code
CREATE OR REPLACE FUNCTION public.reseller_ensure_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _code text;
  i int;
BEGIN
  IF _uid IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'revendedor') THEN
    RETURN NULL;
  END IF;

  SELECT referral_code INTO _code
    FROM public.user_roles
    WHERE user_id = _uid AND role = 'revendedor'
    LIMIT 1;
  IF _code IS NOT NULL THEN RETURN _code; END IF;

  LOOP
    _code := '';
    FOR i IN 1..8 LOOP
      _code := _code || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random() * 32)::int + 1, 1);
    END LOOP;
    BEGIN
      UPDATE public.user_roles
        SET referral_code = _code
        WHERE user_id = _uid AND role = 'revendedor' AND referral_code IS NULL;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- code already taken, generate another
      CONTINUE;
    END;
  END LOOP;
  RETURN _code;
END $function$;

-- Public lookup: /r/<code> redirects to signup with the reseller id
CREATE OR REPLACE FUNCTION public.resolve_referral_code(_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT ur.user_id
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'revendedor'
    AND ur.referral_code = upper(btrim(coalesce(_code, '')))
    AND p.deleted_at IS NULL
    AND COALESCE(p.blocked, false) = false
  LIMIT 1
$function$;

REVOKE EXECUTE ON FUNCTION public.reseller_ensure_referral_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reseller_ensure_referral_code() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_referral_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_referral_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_referral_code(text) TO service_role;