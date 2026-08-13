DROP FUNCTION IF EXISTS public.list_request_comments(uuid);
CREATE OR REPLACE FUNCTION public.list_request_comments(_request_id uuid)
 RETURNS TABLE(id uuid, body text, author_initials text, avatar_url text, mine boolean, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id, c.body, public.mask_name(p.full_name), pp.avatar_url, c.user_id = auth.uid(), c.created_at
  FROM public.request_comments c
  LEFT JOIN public.profiles p ON p.id = c.user_id
  LEFT JOIN public.profile_preferences pp ON pp.id = c.user_id
  WHERE auth.uid() IS NOT NULL AND c.request_id = _request_id
  ORDER BY c.created_at ASC
$function$;