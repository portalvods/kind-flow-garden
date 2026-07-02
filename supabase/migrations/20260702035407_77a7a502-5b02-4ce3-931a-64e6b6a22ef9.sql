ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

CREATE OR REPLACE FUNCTION public.email_from_whatsapp(_whatsapp text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.email
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.whatsapp = _whatsapp
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.email_from_whatsapp(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_from_whatsapp(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_catalog_availability(
  _tmdb_id bigint,
  _title_normalized text,
  _year integer,
  _kind text
)
RETURNS TABLE(category text, title text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _tmdb_id IS NOT NULL THEN
    RETURN QUERY
    SELECT c.category, c.title
    FROM public.catalog_items c
    WHERE c.tmdb_id = _tmdb_id AND c.kind = _kind
    LIMIT 1;

    IF FOUND THEN RETURN; END IF;
  END IF;

  IF _year IS NOT NULL THEN
    RETURN QUERY
    SELECT c.category, c.title
    FROM public.catalog_items c
    WHERE c.title_normalized = _title_normalized AND c.year = _year AND c.kind = _kind
    LIMIT 1;

    IF FOUND THEN RETURN; END IF;
  END IF;

  RETURN QUERY
  SELECT c.category, c.title
  FROM public.catalog_items c
  WHERE c.title_normalized = _title_normalized AND c.kind = _kind
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.check_catalog_availability(bigint, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_catalog_availability(bigint, text, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, whatsapp, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'whatsapp',
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    whatsapp = EXCLUDED.whatsapp,
    email = EXCLUDED.email,
    updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'cliente')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;