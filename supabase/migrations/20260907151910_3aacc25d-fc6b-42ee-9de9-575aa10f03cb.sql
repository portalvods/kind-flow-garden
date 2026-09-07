
CREATE TABLE public.wa_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp text NOT NULL,
  contact_name text,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.wa_messages TO authenticated;
GRANT ALL ON public.wa_messages TO service_role;

ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver conversas" ON public.wa_messages
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins podem registrar conversas" ON public.wa_messages
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX wa_messages_whatsapp_created_idx ON public.wa_messages (whatsapp, created_at DESC);

CREATE OR REPLACE FUNCTION public.bot_log_message(_secret text, _whatsapp text, _direction text, _body text, _name text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE stored text;
BEGIN
  SELECT value INTO stored FROM public.site_settings WHERE key = 'bot_webhook_secret';
  IF stored IS NULL OR stored = '' OR stored <> _secret THEN RETURN; END IF;
  IF _direction NOT IN ('in','out') THEN RETURN; END IF;
  IF coalesce(btrim(_body),'') = '' THEN RETURN; END IF;
  INSERT INTO public.wa_messages (whatsapp, contact_name, direction, body)
  VALUES (regexp_replace(coalesce(_whatsapp,''),'\D','','g'), NULLIF(btrim(coalesce(_name,'')),''), _direction, left(_body, 4000));
END $$;

REVOKE EXECUTE ON FUNCTION public.bot_log_message(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bot_log_message(text,text,text,text,text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bot_client_status(_secret text, _whatsapp text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  stored text;
  _uid uuid;
  _limit int;
  _used int;
  _name text;
  _blocked boolean;
  _reqs jsonb;
BEGIN
  SELECT value INTO stored FROM public.site_settings WHERE key = 'bot_webhook_secret';
  IF stored IS NULL OR stored = '' OR stored <> _secret THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unauthorized');
  END IF;

  _uid := public.find_profile_by_wa(_whatsapp);
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_registered');
  END IF;

  SELECT full_name, (blocked OR deleted_at IS NOT NULL) INTO _name, _blocked
    FROM public.profiles WHERE id = _uid;

  SELECT COALESCE(NULLIF(value,'')::int, 5) INTO _limit FROM public.site_settings WHERE key='daily_request_limit';
  _limit := COALESCE(_limit, 5);

  SELECT COUNT(*) INTO _used FROM public.requests
    WHERE user_id = _uid AND created_at >= date_trunc('day', now());

  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO _reqs FROM (
    SELECT r.title, r.status::text AS status, r.request_kind::text AS kind,
           r.content_type::text AS type, r.rejection_reason,
           to_char(r.created_at, 'DD/MM/YYYY') AS created
    FROM public.requests r
    WHERE r.user_id = _uid
    ORDER BY r.created_at DESC
    LIMIT 10
  ) x;

  RETURN jsonb_build_object(
    'ok', true, 'code', 'found', 'name', _name, 'blocked', _blocked,
    'limit', _limit, 'used', _used, 'requests', _reqs
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.bot_client_status(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bot_client_status(text,text) TO anon, authenticated, service_role;
