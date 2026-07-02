CREATE OR REPLACE FUNCTION public.weekly_news(_days integer DEFAULT 7)
 RETURNS TABLE(request_id uuid, title text, year integer, content_type text, request_kind text, poster_path text, completed_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (lower(regexp_replace(r.title,'[^a-zA-Z0-9]+',' ','g')), r.year)
    r.id,
    r.title,
    r.year,
    r.content_type::text,
    r.request_kind::text,
    r.poster_path,
    COALESCE(r.updated_at, r.created_at)
  FROM public.requests r
  WHERE r.status IN ('completed','added','fixed')
    AND r.request_kind IN ('adicao','atualizacao')
    AND COALESCE(r.updated_at, r.created_at) >= now() - make_interval(days => GREATEST(_days,1))
  ORDER BY lower(regexp_replace(r.title,'[^a-zA-Z0-9]+',' ','g')), r.year, COALESCE(r.updated_at, r.created_at) DESC
$function$;