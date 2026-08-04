CREATE OR REPLACE FUNCTION public.track_session()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_sessions (user_id, last_active_at)
    VALUES (auth.uid(), now())
    ON CONFLICT (user_id) DO UPDATE
    SET last_active_at = now();
END;
$$;

-- Allow authenticated users to call the function
GRANT EXECUTE ON FUNCTION public.track_session() TO authenticated;
