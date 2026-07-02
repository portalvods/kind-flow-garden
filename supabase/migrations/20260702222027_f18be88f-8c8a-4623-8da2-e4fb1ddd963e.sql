
CREATE OR REPLACE FUNCTION public.find_profile_by_wa(_phone text)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p text := regexp_replace(coalesce(_phone,''),'\D','','g');
  candidates text[];
  cand text;
  uid uuid;
  local9 text;
  local8 text;
BEGIN
  IF length(p) < 8 THEN RETURN NULL; END IF;
  candidates := ARRAY[p];

  -- Se começa com 55 (Brasil), gera variações com/sem o 9 após o DDD
  IF left(p,2) = '55' AND length(p) IN (12,13) THEN
    IF length(p) = 13 THEN
      -- 55 DD 9 XXXXXXXX  -> também tenta sem o 9
      candidates := candidates || (left(p,4) || substring(p from 6));
    ELSE
      -- 55 DD XXXXXXXX -> também tenta com o 9
      candidates := candidates || (left(p,4) || '9' || substring(p from 5));
    END IF;
  END IF;

  -- Sem código de país (tenta prefixar 55)
  IF left(p,2) <> '55' AND length(p) IN (10,11) THEN
    candidates := candidates || ('55' || p);
    IF length(p) = 10 THEN
      candidates := candidates || ('55' || left(p,2) || '9' || substring(p from 3));
    ELSIF length(p) = 11 THEN
      candidates := candidates || ('55' || left(p,2) || substring(p from 4));
    END IF;
  END IF;

  FOREACH cand IN ARRAY candidates LOOP
    SELECT id INTO uid FROM public.profiles
      WHERE whatsapp = cand AND deleted_at IS NULL LIMIT 1;
    IF uid IS NOT NULL THEN RETURN uid; END IF;
  END LOOP;

  -- Último recurso: casa pelos últimos 8 dígitos (número local sem DDD)
  IF length(p) >= 8 THEN
    local8 := right(p, 8);
    SELECT id INTO uid FROM public.profiles
      WHERE right(whatsapp, 8) = local8 AND deleted_at IS NULL
      LIMIT 1;
    IF uid IS NOT NULL THEN RETURN uid; END IF;
  END IF;

  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.bot_create_request(_secret text, _whatsapp text, _title text, _content_type text DEFAULT 'movie'::text, _request_kind text DEFAULT 'adicao'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  _uid := public.find_profile_by_wa(_phone);

  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok',false,'code','not_registered');
  END IF;

  SELECT (blocked OR deleted_at IS NOT NULL) INTO _blocked
    FROM public.profiles WHERE id = _uid;
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
END $function$;
