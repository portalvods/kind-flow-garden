CREATE TABLE public.content_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_key text NOT NULL,
  title text NOT NULL,
  year integer,
  content_type text NOT NULL DEFAULT 'movie',
  tmdb_id bigint,
  poster_path text,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, content_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_reviews TO authenticated;
GRANT ALL ON public.content_reviews TO service_role;

ALTER TABLE public.content_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read reviews" ON public.content_reviews
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own review" ON public.content_reviews
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND NOT public.is_blocked(auth.uid()));
CREATE POLICY "Users update own review" ON public.content_reviews
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own review" ON public.content_reviews
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_content_reviews_key ON public.content_reviews (content_key);

CREATE TRIGGER content_reviews_updated_at BEFORE UPDATE ON public.content_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.upsert_content_review(
  _content_key text, _title text, _year integer, _content_type text,
  _tmdb_id bigint, _poster_path text, _rating smallint, _body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _txt text := NULLIF(btrim(coalesce(_body,'')), '');
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF public.is_blocked(_uid) THEN RAISE EXCEPTION 'Conta bloqueada.'; END IF;
  IF _rating < 1 OR _rating > 5 THEN RAISE EXCEPTION 'Nota inválida.'; END IF;
  IF _txt IS NOT NULL AND length(_txt) > 500 THEN _txt := left(_txt, 500); END IF;

  INSERT INTO public.content_reviews (user_id, content_key, title, year, content_type, tmdb_id, poster_path, rating, body)
  VALUES (_uid, _content_key, left(btrim(_title), 200), _year, coalesce(_content_type,'movie'), _tmdb_id, _poster_path, _rating, _txt)
  ON CONFLICT (user_id, content_key) DO UPDATE
    SET rating = EXCLUDED.rating, body = EXCLUDED.body, poster_path = COALESCE(EXCLUDED.poster_path, public.content_reviews.poster_path), updated_at = now()
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.list_content_reviews(_content_key text)
RETURNS TABLE(id uuid, rating smallint, body text, author_initials text, mine boolean, created_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT r.id, r.rating, r.body, public.mask_name(p.full_name), r.user_id = auth.uid(), r.created_at
  FROM public.content_reviews r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE auth.uid() IS NOT NULL AND r.content_key = _content_key
  ORDER BY r.created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.content_review_stats(_keys text[])
RETURNS TABLE(content_key text, avg_rating numeric, total integer, my_rating smallint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT r.content_key, round(avg(r.rating)::numeric, 1), count(*)::int,
         max(r.rating) FILTER (WHERE r.user_id = auth.uid())
  FROM public.content_reviews r
  WHERE auth.uid() IS NOT NULL AND r.content_key = ANY(_keys)
  GROUP BY r.content_key
$$;

CREATE OR REPLACE FUNCTION public.top_reviewed_content(_limit integer DEFAULT 40)
RETURNS TABLE(content_key text, title text, year integer, content_type text, poster_path text, avg_rating numeric, total integer, my_rating smallint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT r.content_key,
         (array_agg(r.title ORDER BY r.created_at))[1],
         (array_agg(r.year ORDER BY r.created_at))[1],
         (array_agg(r.content_type ORDER BY r.created_at))[1],
         (array_agg(r.poster_path ORDER BY r.created_at) FILTER (WHERE r.poster_path IS NOT NULL))[1],
         round(avg(r.rating)::numeric, 1), count(*)::int,
         max(r.rating) FILTER (WHERE r.user_id = auth.uid())
  FROM public.content_reviews r
  WHERE auth.uid() IS NOT NULL
  GROUP BY r.content_key
  ORDER BY count(*) DESC, avg(r.rating) DESC
  LIMIT GREATEST(COALESCE(_limit, 40), 1)
$$;