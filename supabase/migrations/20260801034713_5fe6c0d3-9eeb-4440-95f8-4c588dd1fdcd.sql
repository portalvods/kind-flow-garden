
-- Fontes vencidas para sincronização automática
CREATE OR REPLACE FUNCTION public.catalog_cron_due_sources(_secret text)
RETURNS TABLE(id uuid, url text, name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT value INTO v_secret FROM public.site_settings WHERE key = 'bot_webhook_secret';
  IF v_secret IS NULL OR v_secret = '' OR _secret IS DISTINCT FROM v_secret THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN QUERY
  SELECT s.id, s.url, s.name
  FROM public.m3u_sources s
  WHERE s.active
    AND (
      s.last_synced_at IS NULL
      OR s.last_synced_at < now() - make_interval(hours => GREATEST(s.sync_interval_hours, 1))
    );
END;
$$;

-- Substitui todos os itens de uma fonte
CREATE OR REPLACE FUNCTION public.catalog_cron_replace(_secret text, _source_id uuid, _items jsonb)
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

  DELETE FROM public.catalog_items WHERE source_id = _source_id;

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

-- Finaliza a sincronização registrando status
CREATE OR REPLACE FUNCTION public.catalog_cron_finish(
  _secret text, _source_id uuid, _status text, _error text, _movies integer, _series integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT value INTO v_secret FROM public.site_settings WHERE key = 'bot_webhook_secret';
  IF v_secret IS NULL OR v_secret = '' OR _secret IS DISTINCT FROM v_secret THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.m3u_sources
  SET last_synced_at = now(),
      last_status = _status,
      last_error = _error,
      movies_count = COALESCE(_movies, movies_count),
      series_count = COALESCE(_series, series_count),
      updated_at = now()
  WHERE id = _source_id;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_cron_due_sources(text) FROM public;
REVOKE ALL ON FUNCTION public.catalog_cron_replace(text, uuid, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.catalog_cron_finish(text, uuid, text, text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.catalog_cron_due_sources(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.catalog_cron_replace(text, uuid, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.catalog_cron_finish(text, uuid, text, text, integer, integer) TO anon, authenticated, service_role;
