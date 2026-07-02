GRANT INSERT ON public.user_roles TO authenticated;

CREATE POLICY "Users can create own cliente role" ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND role = 'cliente');