-- Notifications (sininho)
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications read" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own notifications update" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own notifications delete" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.notify_request_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _label text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    _label := CASE NEW.status::text
      WHEN 'analyzing' THEN 'em análise'
      WHEN 'processing' THEN 'em andamento'
      WHEN 'approved' THEN 'aprovado'
      WHEN 'added' THEN 'adicionado'
      WHEN 'completed' THEN 'concluído'
      WHEN 'fixed' THEN 'consertado'
      WHEN 'rejected' THEN 'recusado'
      ELSE NEW.status::text END;
    INSERT INTO public.notifications(user_id, title, body, link)
    VALUES (NEW.user_id, NEW.title || ' — ' || _label,
      CASE WHEN NEW.status::text = 'rejected' AND NEW.rejection_reason IS NOT NULL
        THEN 'Motivo: ' || NEW.rejection_reason ELSE 'Seu pedido foi atualizado.' END,
      '/pedidos');
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_request_status() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_notify_request_status AFTER UPDATE OF status ON public.requests
FOR EACH ROW EXECUTE FUNCTION public.notify_request_status();

-- Revendedores
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reseller_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.reseller_list_clients()
RETURNS TABLE(id uuid, full_name text, whatsapp text, created_at timestamptz, total bigint, pending bigint, completed bigint, today bigint, last_request timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.whatsapp, p.created_at,
    COUNT(r.id),
    COUNT(r.id) FILTER (WHERE r.status::text IN ('pending','analyzing','processing','approved')),
    COUNT(r.id) FILTER (WHERE r.status::text IN ('completed','added','fixed')),
    COUNT(r.id) FILTER (WHERE r.created_at >= date_trunc('day', now())),
    MAX(r.created_at)
  FROM public.profiles p
  LEFT JOIN public.requests r ON r.user_id = p.id
  WHERE p.reseller_id = auth.uid()
    AND (public.has_role(auth.uid(),'revendedor') OR public.has_role(auth.uid(),'admin'))
  GROUP BY p.id
  ORDER BY p.full_name NULLS LAST
$$;

CREATE OR REPLACE FUNCTION public.reseller_client_requests(_client uuid)
RETURNS TABLE(id uuid, title text, content_type text, request_kind text, status text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.title, r.content_type::text, r.request_kind::text, r.status::text, r.created_at
  FROM public.requests r JOIN public.profiles p ON p.id = r.user_id
  WHERE r.user_id = _client AND p.reseller_id = auth.uid()
  ORDER BY r.created_at DESC LIMIT 100
$$;

CREATE OR REPLACE FUNCTION public.reseller_link_client(_whatsapp text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _cur uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'revendedor') OR public.has_role(auth.uid(),'admin')) THEN
    RETURN jsonb_build_object('ok',false,'error','Acesso negado.');
  END IF;
  _id := public.find_profile_by_wa(_whatsapp);
  IF _id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Número não cadastrado no site.'); END IF;
  IF _id = auth.uid() THEN RETURN jsonb_build_object('ok',false,'error','Você não pode vincular a si mesmo.'); END IF;
  SELECT reseller_id INTO _cur FROM public.profiles WHERE id = _id;
  IF _cur IS NOT NULL AND _cur <> auth.uid() THEN
    RETURN jsonb_build_object('ok',false,'error','Este cliente já pertence a outro revendedor.');
  END IF;
  UPDATE public.profiles SET reseller_id = auth.uid() WHERE id = _id;
  RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.reseller_unlink_client(_client uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.profiles SET reseller_id = NULL WHERE id = _client AND reseller_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(_user uuid, _role app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF _user = auth.uid() THEN RAISE EXCEPTION 'Não altere seu próprio papel.'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _user AND role IN ('cliente','revendedor');
  INSERT INTO public.user_roles(user_id, role) VALUES (_user, _role) ON CONFLICT DO NOTHING;
END $$;

REVOKE EXECUTE ON FUNCTION public.reseller_list_clients() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reseller_client_requests(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reseller_link_client(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reseller_unlink_client(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reseller_list_clients() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reseller_client_requests(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reseller_link_client(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reseller_unlink_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, app_role) TO authenticated;

-- Manutenção
INSERT INTO public.site_settings(key, value) VALUES
  ('maintenance_enabled','false'),
  ('maintenance_message','Estamos em manutenção. Voltamos em breve!')
ON CONFLICT (key) DO NOTHING;