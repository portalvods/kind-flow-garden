
-- M3U sources
CREATE TABLE public.m3u_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  sync_interval_hours INTEGER NOT NULL DEFAULT 12,
  last_synced_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,
  movies_count INTEGER NOT NULL DEFAULT 0,
  series_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.m3u_sources TO authenticated;
GRANT ALL ON public.m3u_sources TO service_role;
ALTER TABLE public.m3u_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage m3u sources" ON public.m3u_sources FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER m3u_sources_updated_at BEFORE UPDATE ON public.m3u_sources
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Catalog items
CREATE TABLE public.catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.m3u_sources(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('movie','series')),
  title TEXT NOT NULL,
  title_normalized TEXT NOT NULL,
  year INTEGER,
  category TEXT,
  tmdb_id BIGINT,
  stream_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_items TO authenticated;
GRANT ALL ON public.catalog_items TO service_role;
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage catalog items" ON public.catalog_items FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX catalog_items_title_norm_idx ON public.catalog_items (title_normalized);
CREATE INDEX catalog_items_tmdb_idx ON public.catalog_items (tmdb_id) WHERE tmdb_id IS NOT NULL;
CREATE INDEX catalog_items_kind_idx ON public.catalog_items (kind);
