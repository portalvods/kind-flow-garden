
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  whatsapp text NOT NULL,
  code_hash text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_resets_token_hash_idx ON public.password_resets (token_hash);
CREATE INDEX IF NOT EXISTS password_resets_whatsapp_idx ON public.password_resets (whatsapp);

GRANT SELECT, INSERT, UPDATE ON public.password_resets TO anon, authenticated;
GRANT ALL ON public.password_resets TO service_role;

ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;
-- No policies: access is only via SECURITY DEFINER functions below.

CREATE OR REPLACE FUNCTION public.request_wa_password_reset(
  _whatsapp text,
  _code_hash text,
  _token_hash text,
  _ttl_seconds int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid;
  _phone text := regexp_replace(coalesce(_whatsapp,''), '\D','','g');
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

  -- Rate limit: max 5 pedidos abertos por WhatsApp na última hora
  IF (SELECT count(*) FROM public.password_resets
        WHERE whatsapp = _phone AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'Muitas solicitações. Aguarde alguns minutos.';
  END IF;

  INSERT INTO public.password_resets (user_id, whatsapp, code_hash, token_hash, expires_at)
    VALUES (_uid, _phone, _code_hash, _token_hash, now() + make_interval(secs => _ttl_seconds));
END $$;

CREATE OR REPLACE FUNCTION public.complete_wa_password_reset(
  _token_hash text,
  _code_hash text,
  _new_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  _row public.password_resets%ROWTYPE;
BEGIN
  IF length(coalesce(_new_password,'')) < 6 THEN
    RAISE EXCEPTION 'A senha precisa ter no mínimo 6 caracteres.';
  END IF;

  SELECT * INTO _row FROM public.password_resets
    WHERE token_hash = _token_hash AND used_at IS NULL
    ORDER BY created_at DESC LIMIT 1;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Solicitação inválida ou já usada. Peça um novo código.';
  END IF;

  IF _row.expires_at < now() THEN
    RAISE EXCEPTION 'Código expirado. Solicite um novo.';
  END IF;

  IF _row.attempts >= 5 THEN
    RAISE EXCEPTION 'Muitas tentativas. Solicite um novo código.';
  END IF;

  IF _row.code_hash <> _code_hash THEN
    UPDATE public.password_resets SET attempts = attempts + 1 WHERE id = _row.id;
    RAISE EXCEPTION 'Código incorreto.';
  END IF;

  UPDATE auth.users
     SET encrypted_password = extensions.crypt(_new_password, extensions.gen_salt('bf')),
         updated_at = now()
   WHERE id = _row.user_id;

  UPDATE public.password_resets SET used_at = now() WHERE id = _row.id;
END $$;

REVOKE ALL ON FUNCTION public.request_wa_password_reset(text,text,text,int) FROM public;
REVOKE ALL ON FUNCTION public.complete_wa_password_reset(text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.request_wa_password_reset(text,text,text,int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_wa_password_reset(text,text,text) TO anon, authenticated;
