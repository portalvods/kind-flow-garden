CREATE TABLE public.request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

GRANT SELECT, INSERT, DELETE ON public.request_comments TO authenticated;
GRANT ALL ON public.request_comments TO service_role;

ALTER TABLE public.request_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read comments" ON public.request_comments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own comment" ON public.request_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND NOT public.is_blocked(auth.uid()));
CREATE POLICY "Users delete own comment" ON public.request_comments
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX request_comments_request_idx ON public.request_comments(request_id, created_at);

CREATE OR REPLACE FUNCTION public.list_request_comments(_request_id uuid)
RETURNS TABLE(id uuid, body text, author_initials text, mine boolean, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT c.id, c.body, public.mask_name(p.full_name), c.user_id = auth.uid(), c.created_at
  FROM public.request_comments c
  LEFT JOIN public.profiles p ON p.id = c.user_id
  WHERE auth.uid() IS NOT NULL AND c.request_id = _request_id
  ORDER BY c.created_at ASC
$$;

CREATE OR REPLACE FUNCTION public.add_request_comment(_request_id uuid, _body text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _txt text := btrim(coalesce(_body,''));
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF public.is_blocked(_uid) THEN RAISE EXCEPTION 'Conta bloqueada.'; END IF;
  IF length(_txt) < 2 THEN RAISE EXCEPTION 'Comentário muito curto.'; END IF;
  IF length(_txt) > 500 THEN _txt := left(_txt, 500); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.requests WHERE id = _request_id) THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;
  IF (SELECT count(*) FROM public.request_comments
       WHERE user_id = _uid AND created_at > now() - interval '1 minute') >= 5 THEN
    RAISE EXCEPTION 'Muitos comentários seguidos. Aguarde um pouco.';
  END IF;
  INSERT INTO public.request_comments(request_id, user_id, body)
    VALUES (_request_id, _uid, _txt) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.delete_request_comment(_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.request_comments
   WHERE id = _id AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
END $$;

DROP FUNCTION IF EXISTS public.community_requests(integer);

CREATE FUNCTION public.community_requests(_limit integer DEFAULT 60)
 RETURNS TABLE(request_id uuid, title text, year integer, content_type text, request_kind text, status text, poster_path text, author_initials text, votes integer, voted boolean, comments integer, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT r.id, r.title, r.year, r.content_type, r.request_kind, r.status, r.poster_path, r.user_id, r.created_at,
           lower(regexp_replace(r.title, '[^a-zA-Z0-9]+', ' ', 'g')) AS k
    FROM public.requests r
    WHERE auth.uid() IS NOT NULL
      AND r.status IN ('pending','analyzing','approved','processing')
  ), grouped AS (
    SELECT b.k, b.year, b.content_type, b.request_kind,
           (array_agg(b.id ORDER BY b.created_at))[1] AS rep_id,
           array_agg(b.id) AS ids,
           min(b.created_at) AS first_at
    FROM base b
    GROUP BY b.k, b.year, b.content_type, b.request_kind
  )
  SELECT b.id, b.title, b.year, b.content_type::text, b.request_kind::text, b.status::text, b.poster_path,
         public.mask_name(p.full_name),
         (SELECT COUNT(*) FROM public.request_votes v WHERE v.request_id = ANY(g.ids))::int,
         EXISTS (SELECT 1 FROM public.request_votes v2 WHERE v2.request_id = ANY(g.ids) AND v2.user_id = auth.uid()),
         (SELECT COUNT(*) FROM public.request_comments c WHERE c.request_id = b.id)::int,
         g.first_at
  FROM grouped g
  JOIN base b ON b.id = g.rep_id
  LEFT JOIN public.profiles p ON p.id = b.user_id
  ORDER BY 9 DESC, g.first_at DESC
  LIMIT GREATEST(COALESCE(_limit, 60), 1)
$function$;