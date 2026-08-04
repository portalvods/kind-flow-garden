-- 1. Tabela para preferências de perfil
CREATE TABLE IF NOT EXISTS public.profile_preferences (
    id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    theme_color TEXT DEFAULT '#3B82F6',
    accent_color TEXT DEFAULT '#22D3EE',
    avatar_url TEXT,
    tutorial_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE ON public.profile_preferences TO authenticated;
GRANT ALL ON public.profile_preferences TO service_role;

ALTER TABLE public.profile_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own preferences"
ON public.profile_preferences FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can update their own preferences"
ON public.profile_preferences FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own preferences"
ON public.profile_preferences FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- 2. Permitir que anônimos vejam configurações básicas para o Modo Convidado
GRANT SELECT ON public.site_settings TO anon;

-- 3. Habilitar RLS e políticas para Modo Convidado em tabelas de visualização pública
-- (Garantir que anon possa ler Novidades e Em Alta se as rotas permitirem)
GRANT SELECT ON public.requests TO anon;
GRANT SELECT ON public.catalog_items TO anon;
GRANT SELECT ON public.content_reviews TO anon;
