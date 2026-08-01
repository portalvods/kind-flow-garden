CREATE TABLE public.request_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.request_votes TO authenticated;
GRANT ALL ON public.request_votes TO service_role;

ALTER TABLE public.request_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read votes" ON public.request_votes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own vote" ON public.request_votes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own vote" ON public.request_votes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_request_votes_request ON public.request_votes(request_id);

CREATE OR REPLACE FUNCTION public.mask_name(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(
      (SELECT string_agg(upper(left(w, 1)) || '...', ' ')
       FROM unnest(string_to_array(btrim(regexp_replace(COALESCE(_name,''), '\s+', ' ', 'g')), ' ')) AS w
       WHERE length(w) > 0),
      ''),
    'Cliente')
$$;

CREATE OR REPLACE FUNCTION public.community_requests(_limit integer DEFAULT 60)
RETURNS TABLE(
  request_id uuid,
  title text,
  year integer,
  content_type text,
  request_kind text,
  status text,
  poster_path text,
  author_initials text,
  votes integer,
  voted boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.title,
    r.year,
    r.content_type::text,
    r.request_kind::text,
    r.status::text,
    r.poster_path,
    public.mask_name(p.full_name),
    (SELECT COUNT(*) FROM public.request_votes v WHERE v.request_id = r.id)::int,
    EXISTS (SELECT 1 FROM public.request_votes v2 WHERE v2.request_id = r.id AND v2.user_id = auth.uid()),
    r.created_at
  FROM public.requests r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE auth.uid() IS NOT NULL
    AND r.status IN ('pending','analyzing','approved','processing')
  ORDER BY (SELECT COUNT(*) FROM public.request_votes v3 WHERE v3.request_id = r.id) DESC, r.created_at DESC
  LIMIT GREATEST(COALESCE(_limit, 60), 1)
$$;

CREATE OR REPLACE FUNCTION public.toggle_request_vote(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing uuid;
  _voted boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;
  IF public.is_blocked(_uid) THEN
    RAISE EXCEPTION 'Conta bloqueada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.requests WHERE id = _request_id) THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  SELECT id INTO _existing FROM public.request_votes
    WHERE request_id = _request_id AND user_id = _uid;

  IF _existing IS NULL THEN
    INSERT INTO public.request_votes (request_id, user_id) VALUES (_request_id, _uid);
    _voted := true;
  ELSE
    DELETE FROM public.request_votes WHERE id = _existing;
    _voted := false;
  END IF;

  RETURN jsonb_build_object(
    'voted', _voted,
    'votes', (SELECT COUNT(*) FROM public.request_votes WHERE request_id = _request_id)
  );
END $$;