
CREATE OR REPLACE FUNCTION public.catalog_cron_append(_secret text, _source_id uuid, _items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_count integer;
BEGIN
  SELECT value INTO v_secret FROM public.site_settings WHERE key = 'bot_webhook_secret';
  IF v_secret IS NULL OR v_secret = '' OR _secret IS DISTINCT FROM v_secret THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  INSERT INTO public.catalog_items (source_id, kind, title, title_normalized, year, category, tmdb_id, stream_url)
  SELECT _source_id, x.kind, x.title, x.title_normalized, x.year, x.category, x.tmdb_id, x.stream_url
  FROM jsonb_to_recordset(coalesce(_items, '[]'::jsonb)) AS x(
    kind text, title text, title_normalized text, year integer,
    category text, tmdb_id bigint, stream_url text
  )
  WHERE x.title IS NOT NULL AND x.title_normalized IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_cron_append(text, uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.catalog_cron_append(text, uuid, jsonb) TO anon, authenticated, service_role;
