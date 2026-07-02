
-- Dedupe WhatsApp (mantém o mais antigo, sufixa os demais)
UPDATE public.profiles p SET whatsapp = whatsapp || '-dup-' || substr(id::text,1,4)
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY whatsapp ORDER BY created_at) rn
    FROM public.profiles WHERE whatsapp IS NOT NULL AND whatsapp <> ''
  ) t WHERE rn > 1
);
UPDATE public.profiles SET whatsapp = 'sem-numero-' || substr(id::text,1,8) WHERE whatsapp IS NULL OR whatsapp = '';
ALTER TABLE public.profiles ALTER COLUMN whatsapp SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_whatsapp_unique ON public.profiles (whatsapp);

DO $$ BEGIN
  CREATE TYPE public.request_kind AS ENUM ('adicao', 'atualizacao', 'conserto');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS request_kind public.request_kind NOT NULL DEFAULT 'adicao',
  ADD COLUMN IF NOT EXISTS format text;

CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  content text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone auth can read templates" ON public.message_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage templates" ON public.message_templates FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS tg_message_templates_updated_at ON public.message_templates;
CREATE TRIGGER tg_message_templates_updated_at BEFORE UPDATE ON public.message_templates FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.message_templates (key, label, content) VALUES
('received', 'Pedido recebido', E'Olá, {cliente}!\n\n👀 *Seu pedido foi recebido e está passando por análise.*\n\n📋 *Detalhes do Pedido:*\n🎬 *Conteúdo:* {titulo}\n📌 *Tipo:* {tipo}\n🏷️ *Formato:* {formato}\n📝 *Obs:* {obs}\n\nNossa equipe já foi notificada. Assim que mudarmos o andamento, você receberá um novo aviso automático por aqui! Time ATLAS. 🚀'),
('analyzing', 'Em análise', E'Olá, {cliente}!\n\n🔍 Seu pedido para o conteúdo *{titulo}* entrou *EM ANÁLISE* pela equipe do ATLAS.\n\nVamos verificar com cautela e iremos lhe retornar em breve! 👨🏻‍💻'),
('approved', 'Aprovado', E'Boa notícia, {cliente}!\n\n✅ Seu pedido para *{titulo}* foi *APROVADO* e logo entrará na grade de conteúdos do ATLAS!\n\nAgora é só aguardar e esperar entrar na grade! 👨🏻‍💻'),
('completed', 'Concluído / Adicionado', E'Olá, {cliente}!\n\n🎉 Ótima Notícia! O seu pedido para *{titulo}* foi *CONCLUÍDO* e já está disponível na grade de conteúdo do ATLAS.\n\n*Atualize seu APP Aproveite! 🚀*'),
('fixed', 'Conserto concluído', E'Olá, {cliente}!\n\n🛠️ Passando para avisar que o conteúdo *{titulo}* já foi consertado pela nossa equipe e está funcionando perfeitamente! ✅\n\n_Por favor, reinicie ou atualize seu aplicativo e aproveite. Bom divertimento! 🚀_'),
('rejected', 'Recusado', E'Olá, {cliente}.\n\n❌ Infelizmente o seu pedido para *{titulo}* foi *RECUSADO* após uma avaliação minuciosa pela equipe ATLAS.\n\n*Possível motivo:* {motivo}'),
('admin_new_request', 'Aviso admin - novo pedido', E'🎬 *Novo pedido no Portal VOD*\n\n👤 Cliente: {cliente}\n📱 WhatsApp: {whatsapp}\n🎯 {tipo}: *{titulo}* ({formato})\n📝 Observações: {obs}\n\nAcesse o painel para gerenciar.')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp text NOT NULL,
  code_hash text NOT NULL,
  purpose text NOT NULL,
  payload jsonb,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_codes_whatsapp_purpose_idx ON public.otp_codes (whatsapp, purpose, created_at DESC);
GRANT ALL ON public.otp_codes TO service_role;
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.site_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read settings" ON public.site_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage settings" ON public.site_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.site_settings (key, value) VALUES ('logo_url', NULL), ('site_name', 'Portal VOD') ON CONFLICT DO NOTHING;
