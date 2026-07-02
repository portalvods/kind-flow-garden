
CREATE TABLE public.ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  template_excerpt text NOT NULL,
  extracted_count int NOT NULL DEFAULT 0,
  matched_count int NOT NULL DEFAULT 0,
  applied_count int NOT NULL DEFAULT 0,
  notified_count int NOT NULL DEFAULT 0,
  auto_applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_analyses TO authenticated;
GRANT ALL ON public.ai_analyses TO service_role;
ALTER TABLE public.ai_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read ai_analyses" ON public.ai_analyses FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins insert ai_analyses" ON public.ai_analyses FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') AND admin_user_id = auth.uid());

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS rating smallint,
  ADD COLUMN IF NOT EXISTS rating_comment text,
  ADD COLUMN IF NOT EXISTS rated_at timestamptz;
ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_rating_check;
ALTER TABLE public.requests ADD CONSTRAINT requests_rating_check CHECK (rating IS NULL OR rating IN (-1, 1));

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='requests' AND policyname='owner can rate own request'
  ) THEN
    EXECUTE $p$CREATE POLICY "owner can rate own request" ON public.requests FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)$p$;
  END IF;
END $$;

CREATE TABLE public.rate_limit_hits (
  id bigserial PRIMARY KEY,
  bucket text NOT NULL,
  key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rate_limit_hits_lookup ON public.rate_limit_hits (bucket, key, created_at DESC);
GRANT ALL ON public.rate_limit_hits TO service_role;
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.rate_limit_check_and_hit(_bucket text, _key text, _window_seconds int)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c int;
BEGIN
  SELECT COUNT(*) INTO c FROM public.rate_limit_hits
    WHERE bucket = _bucket AND key = _key
      AND created_at > now() - make_interval(secs => _window_seconds);
  INSERT INTO public.rate_limit_hits (bucket, key) VALUES (_bucket, _key);
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION public.rate_limit_check_and_hit(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rate_limit_check_and_hit(text, text, int) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_duplicate_requests()
RETURNS TABLE(
  normalized_title text,
  sample_title text,
  content_type text,
  year int,
  request_kind text,
  count int,
  request_ids uuid[],
  user_ids uuid[]
) LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    lower(regexp_replace(r.title, '[^a-zA-Z0-9]+', ' ', 'g')) AS normalized_title,
    (array_agg(r.title ORDER BY r.created_at))[1] AS sample_title,
    r.content_type::text,
    r.year,
    r.request_kind::text,
    COUNT(*)::int AS count,
    array_agg(r.id ORDER BY r.created_at) AS request_ids,
    array_agg(r.user_id ORDER BY r.created_at) AS user_ids
  FROM public.requests r
  WHERE public.has_role(auth.uid(), 'admin')
    AND r.status IN ('pending','analyzing','approved','processing')
  GROUP BY 1, r.content_type, r.year, r.request_kind
  HAVING COUNT(*) >= 2
  ORDER BY COUNT(*) DESC
$$;
