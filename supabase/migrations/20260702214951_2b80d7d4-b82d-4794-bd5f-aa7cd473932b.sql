
CREATE OR REPLACE FUNCTION public.bot_config_by_secret(_secret text)
RETURNS TABLE(enabled boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  stored text;
BEGIN
  SELECT value INTO stored FROM public.site_settings WHERE key = 'bot_webhook_secret';
  IF stored IS NULL OR stored = '' OR stored <> _secret THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT
      COALESCE((SELECT value FROM public.site_settings WHERE key = 'bot_enabled'), 'false') = 'true',
      COALESCE((SELECT value FROM public.site_settings WHERE key = 'bot_message'), '');
END;
$$;

CREATE OR REPLACE FUNCTION public.bot_try_hit(_secret text, _key text, _ttl_seconds int DEFAULT 3600)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  stored text;
  hit_count int;
BEGIN
  SELECT value INTO stored FROM public.site_settings WHERE key = 'bot_webhook_secret';
  IF stored IS NULL OR stored = '' OR stored <> _secret THEN
    RETURN false;
  END IF;
  SELECT COUNT(*) INTO hit_count FROM public.rate_limit_hits
    WHERE bucket = 'bot_reply' AND key = _key AND created_at > now() - make_interval(secs => _ttl_seconds);
  IF hit_count > 0 THEN RETURN false; END IF;
  INSERT INTO public.rate_limit_hits(bucket, key) VALUES('bot_reply', _key);
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bot_config_by_secret(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_try_hit(text, text, int) TO anon, authenticated;
