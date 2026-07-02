CREATE OR REPLACE FUNCTION public.whatsapp_exists(_whatsapp text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE whatsapp = regexp_replace(coalesce(_whatsapp, ''), '\D', '', 'g')
  )
$$;

REVOKE ALL ON FUNCTION public.whatsapp_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_exists(text) TO anon, authenticated;