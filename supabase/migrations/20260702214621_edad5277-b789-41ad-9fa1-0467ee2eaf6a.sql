
-- Ranking de clientes
CREATE OR REPLACE FUNCTION public.admin_top_clients(_limit int DEFAULT 50)
RETURNS TABLE(user_id uuid, full_name text, whatsapp text, total int, completed int, rejected int, pending int, last_request timestamptz)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    p.id, p.full_name, p.whatsapp,
    COUNT(r.id)::int,
    COUNT(r.id) FILTER (WHERE r.status IN ('completed','added','fixed'))::int,
    COUNT(r.id) FILTER (WHERE r.status = 'rejected')::int,
    COUNT(r.id) FILTER (WHERE r.status IN ('pending','analyzing','approved','processing'))::int,
    MAX(r.created_at)
  FROM public.profiles p
  LEFT JOIN public.requests r ON r.user_id = p.id
  WHERE public.has_role(auth.uid(), 'admin') AND p.deleted_at IS NULL
  GROUP BY p.id, p.full_name, p.whatsapp
  HAVING COUNT(r.id) > 0
  ORDER BY COUNT(r.id) DESC
  LIMIT _limit
$$;

-- Timeline: cliente vê o próprio, admin vê todos
CREATE OR REPLACE FUNCTION public.request_timeline(_request_id uuid)
RETURNS TABLE(from_status text, to_status text, note text, created_at timestamptz)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT rl.from_status::text, rl.to_status::text, rl.note, rl.created_at
  FROM public.request_logs rl
  JOIN public.requests r ON r.id = rl.request_id
  WHERE rl.request_id = _request_id
    AND (r.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ORDER BY rl.created_at ASC
$$;

-- Sementes de configuração para motivos, bot e webhook
INSERT INTO public.site_settings (key, value) VALUES
  ('rejection_reasons', '["Título indisponível na fonte","Direitos autorais bloqueados","Já existe pedido igual em andamento","Fora do escopo do servidor","Qualidade insuficiente disponível"]'),
  ('bot_enabled', 'false'),
  ('bot_message', E'Olá! 👋 Recebemos sua mensagem.\n\nPara pedir um filme ou série, acesse nosso site e faça login. Este número é apenas para notificações automáticas.'),
  ('bot_webhook_secret', replace(gen_random_uuid()::text, '-', ''))
ON CONFLICT (key) DO NOTHING;
