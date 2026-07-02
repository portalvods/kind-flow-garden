
INSERT INTO public.message_templates (key, label, content) VALUES
  ('rejected_with_alternatives',
   'Recusado + alternativas',
   '❌ Olá {cliente}, seu pedido *{titulo}* foi recusado.
Motivo: {motivo}

🎯 Enquanto isso, já temos no catálogo:
{alternativas}'),
  ('weekly_news',
   'Novidades da semana (broadcast)',
   '🍿 *Novidades da semana no {site}!*

Confira o que foi adicionado nos últimos 7 dias:

{lista}

Peça o próximo em: {url}')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.weekly_news(_days integer DEFAULT 7)
RETURNS TABLE (
  request_id uuid,
  title text,
  year integer,
  content_type text,
  request_kind text,
  poster_path text,
  completed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    AND COALESCE(r.updated_at, r.created_at) >= now() - make_interval(days => GREATEST(_days,1))
  ORDER BY lower(regexp_replace(r.title,'[^a-zA-Z0-9]+',' ','g')), r.year, COALESCE(r.updated_at, r.created_at) DESC
$$;
GRANT EXECUTE ON FUNCTION public.weekly_news(integer) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.admin_active_whatsapps()
RETURNS TABLE (user_id uuid, whatsapp text, full_name text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p.id, p.whatsapp, p.full_name
  FROM public.profiles p
  WHERE public.has_role(auth.uid(), 'admin')
    AND p.deleted_at IS NULL
    AND COALESCE(p.blocked,false) = false
    AND p.whatsapp IS NOT NULL
    AND length(regexp_replace(p.whatsapp,'\D','','g')) >= 10
$$;
GRANT EXECUTE ON FUNCTION public.admin_active_whatsapps() TO authenticated;
