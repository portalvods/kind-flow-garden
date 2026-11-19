ALTER TABLE public.m3u_sources ADD COLUMN IF NOT EXISTS sync_run uuid, ADD COLUMN IF NOT EXISTS sync_started_at timestamptz;
ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS sync_generation uuid;
CREATE INDEX IF NOT EXISTS catalog_items_source_idx ON public.catalog_items(source_id);
CREATE TABLE public.catalog_sync_batches (run_id uuid NOT NULL, source_id uuid NOT NULL REFERENCES public.m3u_sources(id) ON DELETE CASCADE, batch integer NOT NULL, items jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(run_id,batch));
GRANT ALL ON public.catalog_sync_batches TO service_role;
ALTER TABLE public.catalog_sync_batches ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.catalog_sync_authorize(_secret text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE expected text;
BEGIN
 IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(),'admin') THEN RETURN; END IF;
 SELECT value INTO expected FROM public.site_settings WHERE key='bot_webhook_secret';
 IF expected IS NULL OR expected='' OR _secret IS DISTINCT FROM expected THEN RAISE EXCEPTION 'unauthorized'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.catalog_sync_authorize(text) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.catalog_sync_start(_source_id uuid, _run uuid, _secret text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.m3u_sources;
BEGIN
 PERFORM public.catalog_sync_authorize(_secret);
 SELECT * INTO s FROM public.m3u_sources WHERE id=_source_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fonte não encontrada'; END IF;
 IF s.sync_run IS NOT NULL AND s.sync_started_at > now()-interval '30 minutes' THEN RAISE EXCEPTION 'Esta fonte já está sincronizando. Aguarde a conclusão.'; END IF;
 DELETE FROM public.catalog_sync_batches WHERE source_id=_source_id;
 UPDATE public.m3u_sources SET sync_run=_run,sync_started_at=now(),last_status='syncing',last_error=NULL WHERE id=_source_id;
END; $$;
CREATE OR REPLACE FUNCTION public.catalog_sync_stage(_source_id uuid, _run uuid, _batch integer, _items jsonb, _secret text DEFAULT NULL) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.catalog_sync_authorize(_secret);
 PERFORM 1 FROM public.m3u_sources WHERE id=_source_id AND sync_run=_run FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sincronização expirada'; END IF;
 IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items)>2000 OR _batch<0 THEN RAISE EXCEPTION 'Lote inválido'; END IF;
 INSERT INTO public.catalog_sync_batches(run_id,source_id,batch,items) VALUES(_run,_source_id,_batch,_items) ON CONFLICT(run_id,batch) DO UPDATE SET items=excluded.items;
 RETURN jsonb_array_length(_items);
END; $$;
CREATE OR REPLACE FUNCTION public.catalog_sync_commit(_source_id uuid, _run uuid, _batches integer, _total integer, _secret text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer; movies integer; series integer;
BEGIN
 PERFORM public.catalog_sync_authorize(_secret);
 PERFORM 1 FROM public.m3u_sources WHERE id=_source_id AND sync_run=_run FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sincronização expirada'; END IF;
 SELECT count(*),coalesce(sum(jsonb_array_length(items)),0) INTO n,movies FROM public.catalog_sync_batches WHERE run_id=_run AND source_id=_source_id AND batch>=0 AND batch<_batches;
 IF _total<=0 OR n<>_batches OR movies<>_total THEN RAISE EXCEPTION 'Lista vazia ou importação incompleta; catálogo anterior preservado'; END IF;
 INSERT INTO public.catalog_items(source_id,kind,title,title_normalized,year,category,tmdb_id,stream_url,sync_generation)
 SELECT _source_id,x.kind,x.title,x.title_normalized,x.year,x.category,x.tmdb_id,x.stream_url,_run FROM public.catalog_sync_batches b CROSS JOIN LATERAL jsonb_to_recordset(b.items) AS x(kind text,title text,title_normalized text,year integer,category text,tmdb_id bigint,stream_url text) WHERE b.run_id=_run AND b.source_id=_source_id;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>_total THEN RAISE EXCEPTION 'Importação incompleta'; END IF;
 DELETE FROM public.catalog_items WHERE source_id=_source_id AND sync_generation IS DISTINCT FROM _run;
 SELECT count(*) FILTER(WHERE kind='movie'),count(*) FILTER(WHERE kind='series') INTO movies,series FROM public.catalog_items WHERE source_id=_source_id;
 UPDATE public.m3u_sources SET last_synced_at=now(),last_status='ok',last_error=NULL,movies_count=movies,series_count=series,sync_run=NULL,sync_started_at=NULL WHERE id=_source_id;
 DELETE FROM public.catalog_sync_batches WHERE source_id=_source_id AND run_id=_run;
 RETURN jsonb_build_object('ok',true,'movies',movies,'series',series,'total',n);
END; $$;
CREATE OR REPLACE FUNCTION public.catalog_sync_fail(_source_id uuid, _run uuid, _error text, _secret text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.catalog_sync_authorize(_secret);
 UPDATE public.m3u_sources SET last_status='error',last_error=left(_error,500),sync_run=NULL,sync_started_at=NULL WHERE id=_source_id AND sync_run=_run;
 DELETE FROM public.catalog_sync_batches WHERE source_id=_source_id AND run_id=_run;
END; $$;
REVOKE ALL ON FUNCTION public.catalog_sync_start(uuid,uuid,text), public.catalog_sync_stage(uuid,uuid,integer,jsonb,text), public.catalog_sync_commit(uuid,uuid,integer,integer,text),public.catalog_sync_fail(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_sync_start(uuid,uuid,text), public.catalog_sync_stage(uuid,uuid,integer,jsonb,text), public.catalog_sync_commit(uuid,uuid,integer,integer,text),public.catalog_sync_fail(uuid,uuid,text,text) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.catalog_cron_due_sources(_secret text) RETURNS TABLE(id uuid,url text,name text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.catalog_sync_authorize(_secret);
 RETURN QUERY SELECT s.id,s.url,s.name FROM public.m3u_sources s WHERE s.active AND (s.sync_run IS NULL OR s.sync_started_at<now()-interval '30 minutes') AND (s.last_synced_at IS NULL OR s.last_synced_at<now()-make_interval(hours=>greatest(s.sync_interval_hours,1)) OR (s.last_status='error' AND s.updated_at<now()-interval '15 minutes'));
END; $$;
CREATE OR REPLACE FUNCTION public.catalog_lookup(_items jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; hit record; ov boolean; results jsonb='{}'::jsonb; y integer; tid bigint;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 IF jsonb_typeof(_items)<>'array' OR jsonb_array_length(_items)>40 THEN RAISE EXCEPTION 'Consulta inválida'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
 y=(item->>'year')::integer; tid=(item->>'tmdb_id')::bigint;
 SELECT c.title,c.category INTO hit FROM public.catalog_items c JOIN public.m3u_sources s ON s.id=c.source_id AND s.active WHERE c.kind=item->>'kind' AND ((tid IS NOT NULL AND c.tmdb_id=tid) OR (c.title_normalized=item->>'normalized' AND (y IS NULL OR c.year IS NULL OR c.year=y) AND (tid IS NULL OR c.tmdb_id IS NULL OR c.tmdb_id=tid))) ORDER BY (tid IS NOT NULL AND c.tmdb_id=tid) DESC NULLS LAST,(c.year=y) DESC NULLS LAST LIMIT 1;
 ov=NULL;
 SELECT available INTO ov FROM public.availability_overrides WHERE tmdb_id=tid AND kind=item->>'kind';
 results=results||jsonb_build_object(item->>'key',jsonb_build_object('exists',coalesce(ov,hit.title IS NOT NULL),'category',CASE WHEN ov=false THEN NULL ELSE hit.category END,'match',CASE WHEN ov=false THEN NULL ELSE hit.title END));
 END LOOP;
 RETURN results;
END; $$;
REVOKE ALL ON FUNCTION public.catalog_lookup(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.catalog_lookup(jsonb) TO authenticated,service_role;