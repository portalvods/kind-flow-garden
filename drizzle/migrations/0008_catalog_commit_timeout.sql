ALTER FUNCTION public.catalog_sync_commit(uuid,uuid,integer,integer,text) SET statement_timeout TO '300s';
ALTER FUNCTION public.catalog_sync_start(uuid,uuid,text) SET statement_timeout TO '60s';
ALTER FUNCTION public.catalog_lookup(jsonb) SET statement_timeout TO '30s';
CREATE INDEX IF NOT EXISTS catalog_items_source_generation_idx ON public.catalog_items(source_id,sync_generation);
NOTIFY pgrst, 'reload schema';