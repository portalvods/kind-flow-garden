CREATE OR REPLACE FUNCTION public.community_requests(_limit integer DEFAULT 60)
 RETURNS TABLE(request_id uuid, title text, year integer, content_type text, request_kind text, status text, poster_path text, author_initials text, votes integer, voted boolean, created_at timestamp with time zone)
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
         g.first_at
  FROM grouped g
  JOIN base b ON b.id = g.rep_id
  LEFT JOIN public.profiles p ON p.id = b.user_id
  ORDER BY 9 DESC, g.first_at DESC
  LIMIT GREATEST(COALESCE(_limit, 60), 1)
$function$;

CREATE OR REPLACE FUNCTION public.find_community_duplicate(_title text, _year integer, _content_type text, _request_kind text)
 RETURNS TABLE(request_id uuid, title text, year integer, request_kind text, status text, poster_path text, author_initials text, votes integer, voted boolean, mine boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT r.id, r.title, r.year, r.request_kind, r.status, r.poster_path, r.user_id, r.created_at
    FROM public.requests r
    WHERE auth.uid() IS NOT NULL
      AND r.status IN ('pending','analyzing','approved','processing')
      AND r.content_type::text = _content_type
      AND r.request_kind::text = _request_kind
      AND lower(regexp_replace(r.title, '[^a-zA-Z0-9]+', ' ', 'g'))
          = lower(regexp_replace(COALESCE(_title,''), '[^a-zA-Z0-9]+', ' ', 'g'))
      AND (_year IS NULL OR r.year IS NULL OR r.year = _year)
  ), rep AS (
    SELECT * FROM base ORDER BY created_at LIMIT 1
  )
  SELECT rep.id, rep.title, rep.year, rep.request_kind::text, rep.status::text, rep.poster_path,
         public.mask_name(p.full_name),
         (SELECT COUNT(*) FROM public.request_votes v WHERE v.request_id IN (SELECT id FROM base))::int,
         EXISTS (SELECT 1 FROM public.request_votes v WHERE v.request_id IN (SELECT id FROM base) AND v.user_id = auth.uid()),
         EXISTS (SELECT 1 FROM base b WHERE b.user_id = auth.uid())
  FROM rep
  LEFT JOIN public.profiles p ON p.id = rep.user_id
$function$;