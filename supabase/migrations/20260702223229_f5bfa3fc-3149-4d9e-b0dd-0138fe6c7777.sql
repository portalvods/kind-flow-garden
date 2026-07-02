
INSERT INTO public.site_settings(key, value) VALUES ('bot_orders_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

DROP FUNCTION IF EXISTS public.bot_config_by_secret(text);

CREATE OR REPLACE FUNCTION public.bot_config_by_secret(_secret text)
 RETURNS TABLE(enabled boolean, message text, orders_enabled boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      COALESCE((SELECT value FROM public.site_settings WHERE key = 'bot_message'), ''),
      COALESCE((SELECT value FROM public.site_settings WHERE key = 'bot_orders_enabled'), 'true') = 'true';
END;
$function$;
