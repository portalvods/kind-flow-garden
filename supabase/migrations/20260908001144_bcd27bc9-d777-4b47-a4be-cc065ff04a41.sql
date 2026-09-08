
-- Registro simples de mensagens enviadas (funciona sem chave de serviço)
CREATE OR REPLACE FUNCTION public.wa_log(_whatsapp text, _direction text, _body text, _name text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _direction NOT IN ('in','out') THEN RETURN; END IF;
  IF coalesce(btrim(_body),'') = '' THEN RETURN; END IF;
  IF coalesce(regexp_replace(coalesce(_whatsapp,''),'\D','','g'),'') = '' THEN RETURN; END IF;
  INSERT INTO public.wa_messages (whatsapp, contact_name, direction, body)
  VALUES (regexp_replace(_whatsapp,'\D','','g'), NULLIF(btrim(coalesce(_name,'')),''), _direction, left(_body, 4000));
END $$;

REVOKE EXECUTE ON FUNCTION public.wa_log(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wa_log(text,text,text,text) TO anon, authenticated, service_role;

-- Ajuste manual de disponibilidade dos títulos em alta
CREATE TABLE IF NOT EXISTS public.availability_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('movie','series')),
  available boolean NOT NULL,
  title text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tmdb_id, kind)
);

GRANT SELECT ON public.availability_overrides TO authenticated;
GRANT ALL ON public.availability_overrides TO service_role;

ALTER TABLE public.availability_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos autenticados podem ver ajustes"
  ON public.availability_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins podem criar ajustes"
  ON public.availability_overrides FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins podem alterar ajustes"
  ON public.availability_overrides FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins podem remover ajustes"
  ON public.availability_overrides FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT INSERT, UPDATE, DELETE ON public.availability_overrides TO authenticated;
