import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { User, Palette, Camera, Loader2, CheckCircle2, Film, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Meu perfil | Portal VOD" },
      { name: "description", content: "Atualize seu nome, avatar e as cores do portal do seu jeito." },
      { property: "og:title", content: "Meu perfil | Portal VOD" },
      { property: "og:description", content: "Personalize avatar e cores do portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

const DEFAULT_THEME = "#38BDF8";
const DEFAULT_ACCENT = "#22D3EE";

async function fileToAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  const min = Math.min(bitmap.width, bitmap.height);
  ctx.drawImage(
    bitmap,
    (bitmap.width - min) / 2,
    (bitmap.height - min) / 2,
    min,
    min,
    0,
    0,
    size,
    size,
  );
  return canvas.toDataURL("image/jpeg", 0.82);
}

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: profile } = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
  });

  const { data: prefs } = useQuery({
    queryKey: ["profile-preferences", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profile_preferences")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      return data;
    },
  });

  const [form, setForm] = useState({
    full_name: "",
    theme_color: DEFAULT_THEME,
    accent_color: DEFAULT_ACCENT,
    avatar_url: null as string | null,
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    if (profile === undefined || prefs === undefined) return;
    setForm({
      full_name: profile?.full_name ?? "",
      theme_color: prefs?.theme_color ?? DEFAULT_THEME,
      accent_color: prefs?.accent_color ?? DEFAULT_ACCENT,
      avatar_url: prefs?.avatar_url ?? null,
    });
    setHydrated(true);
  }, [profile, prefs, hydrated]);

  // Live preview of the chosen colors
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--primary", form.theme_color);
    root.style.setProperty("--accent", form.accent_color);
    root.style.setProperty("--ring", form.theme_color);
  }, [form.theme_color, form.accent_color]);

  const save = useMutation({
    mutationFn: async () => {
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ full_name: form.full_name })
        .eq("id", user.id);
      if (pErr) throw pErr;

      const { error } = await supabase.from("profile_preferences").upsert({
        id: user.id,
        theme_color: form.theme_color,
        accent_color: form.accent_color,
        avatar_url: form.avatar_url,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Perfil atualizado!");
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["profile-preferences"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao atualizar"),
  });

  const onPickAvatar = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem.");
      return;
    }
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      setForm((p) => ({ ...p, avatar_url: dataUrl }));
      toast.success("Avatar carregado. Clique em salvar para confirmar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar imagem");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="font-display text-2xl sm:text-3xl font-bold">Meu Perfil</h1>

      <Card className="glass-card border-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Dados Pessoais
          </CardTitle>
          <CardDescription>Gerencie suas informações básicas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col items-center justify-center py-4">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void onPickAvatar(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center mb-2 border-2 border-dashed border-primary/30 relative group overflow-hidden"
            >
              {form.avatar_url ? (
                <img src={form.avatar_url} alt="Seu avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="h-10 w-10 text-primary/40" />
              )}
              <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                <Camera className="h-6 w-6 text-white" />
              </span>
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => fileRef.current?.click()}
              >
                Alterar avatar
              </button>
              {form.avatar_url ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setForm((p) => ({ ...p, avatar_url: null }))}
                >
                  Remover
                </button>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Nome Completo</Label>
            <Input
              value={form.full_name}
              onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>E-mail (não alterável)</Label>
            <Input value={profile?.email ?? ""} disabled />
          </div>
          <div className="space-y-2">
            <Label>WhatsApp</Label>
            <Input value={profile?.whatsapp ?? ""} disabled />
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card border-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Personalização
          </CardTitle>
          <CardDescription>Deixe o portal com a sua cara.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cor de Destaque (Tema)</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.theme_color}
                  onChange={(e) => setForm((prev) => ({ ...prev, theme_color: e.target.value }))}
                  className="h-10 w-20 rounded bg-transparent border-none cursor-pointer"
                />
                <span className="text-sm font-mono">{form.theme_color}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cor de Sotaque (Accent)</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.accent_color}
                  onChange={(e) => setForm((prev) => ({ ...prev, accent_color: e.target.value }))}
                  className="h-10 w-20 rounded bg-transparent border-none cursor-pointer"
                />
                <span className="text-sm font-mono">{form.accent_color}</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-primary/20 bg-primary/5">
            <p className="text-xs text-muted-foreground mb-3 uppercase font-bold">Prévia da Aparência</p>
            <div className="flex items-center gap-2">
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: form.theme_color }}
              >
                <Film className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold truncate" style={{ color: form.theme_color }}>
                {form.full_name || "Seu Nome"}
              </span>
              <div
                className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
                style={{
                  backgroundColor: `${form.accent_color}20`,
                  color: form.accent_color,
                  border: `1px solid ${form.accent_color}40`,
                }}
              >
                VIP
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() =>
              setForm((p) => ({ ...p, theme_color: DEFAULT_THEME, accent_color: DEFAULT_ACCENT }))
            }
          >
            <RotateCcw className="h-4 w-4" />
            Restaurar cores padrão
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" className="glow-primary w-full sm:w-auto" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-2" />
          )}
          Salvar Alterações
        </Button>
      </div>
    </div>
  );
}
