
CREATE OR REPLACE FUNCTION public.bot_create_request(
  _secret text,
  _whatsapp text,
  _title text,
  _content_type text DEFAULT 'movie',
  _request_kind text DEFAULT 'adicao'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored text;
  _phone text := regexp_replace(coalesce(_whatsapp,''),'\D','','g');
  _uid uuid;
  _blocked boolean;
  _limit int;
  _used int;
  _kind public.request_kind;
  _ctype public.content_type;
  _req_id uuid;
  _title_trim text := btrim(coalesce(_title,''));
BEGIN
  SELECT value INTO stored FROM public.site_settings WHERE key='bot_webhook_secret';
  IF stored IS NULL OR stored='' OR stored <> _secret THEN
    RETURN jsonb_build_object('ok',false,'code','unauthorized');
  END IF;

  IF length(_title_trim) < 2 THEN
    RETURN jsonb_build_object('ok',false,'code','empty_title');
  END IF;
  IF length(_title_trim) > 200 THEN
    _title_trim := left(_title_trim, 200);
  END IF;

  SELECT id, blocked OR deleted_at IS NOT NULL
    INTO _uid, _blocked
    FROM public.profiles
    WHERE whatsapp = _phone AND deleted_at IS NULL
    LIMIT 1;

  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok',false,'code','not_registered');
  END IF;
  IF _blocked THEN
    RETURN jsonb_build_object('ok',false,'code','blocked');
  END IF;

  SELECT COALESCE(NULLIF(value,'')::int, 5) INTO _limit
    FROM public.site_settings WHERE key='daily_request_limit';
  _limit := COALESCE(_limit, 5);

  SELECT COUNT(*) INTO _used FROM public.requests
    WHERE user_id = _uid AND created_at >= date_trunc('day', now());

  IF _used >= _limit THEN
    RETURN jsonb_build_object('ok',false,'code','limit_reached','limit',_limit,'used',_used);
  END IF;

  BEGIN _ctype := _content_type::public.content_type; EXCEPTION WHEN others THEN _ctype := 'movie'::public.content_type; END;
  BEGIN _kind := _request_kind::public.request_kind; EXCEPTION WHEN others THEN _kind := 'adicao'::public.request_kind; END;

  INSERT INTO public.requests (user_id, title, content_type, request_kind, notes)
    VALUES (_uid, _title_trim, _ctype, _kind, 'Pedido recebido via WhatsApp (bot)')
    RETURNING id INTO _req_id;

  RETURN jsonb_build_object(
    'ok', true,
    'code','created',
    'request_id', _req_id,
    'user_id', _uid,
    'limit', _limit,
    'used', _used + 1
  );
END $$;
