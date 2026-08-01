CREATE OR REPLACE FUNCTION public.community_requests(_limit integer DEFAULT 60)
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
      AND r.request_kind IN ('adicao','atualizacao')
  ), grouped AS (
    SELECT b.k, b.year, b.content_type, b.request_kind,
           (array_agg(b.id ORDER BY b.created_at))[1] AS rep_id,
           array_agg(b.id) AS ids,
           min(b.created_at) AS first_at
    FROM base b
    GROUP BY b.k, b.year, b.content_type, b.request_kind
    HAVING COUNT(DISTINCT b.user_id) >= 3
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