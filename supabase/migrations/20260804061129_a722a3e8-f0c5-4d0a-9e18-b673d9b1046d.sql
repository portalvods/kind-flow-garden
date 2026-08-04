CREATE TABLE public.user_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    ip_address text,
    user_agent text,
    last_active_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sessions"
ON public.user_sessions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all sessions"
ON public.user_sessions FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Function to track session
CREATE OR REPLACE FUNCTION public.track_session()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.user_sessions (user_id, ip_address, user_agent)
    VALUES (auth.uid(), null, null) -- IP and UA can be handled via server functions if needed
    ON CONFLICT (user_id) DO UPDATE -- Simplification: one session entry per user for "online" status
    SET last_active_at = now();
END;
$$;
