import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { User, Palette, Camera, Loader2, CheckCircle2, Film } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { updateProfilePreferences } from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated/perfil")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const updatePrefsFn = useServerFn(updateProfilePreferences);

  const { data: profile } = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      return data;
    },
  });

  const { data: prefs } = useQuery({
    queryKey: ["profile-preferences", user.id],
    queryFn: async () => {
      const { data } = await supabase.from("profile_preferences").select("*").eq("id", user.id).maybeSingle();
      return data ?? { theme_color: "#3B82F6", accent_color: "#22D3EE", avatar_url: null };
    },
  });

  const [form, setForm] = useState({
    full_name: profile?.full_name ?? "",
    theme_color: prefs?.theme_color ?? "#3B82F6",
    accent_color: prefs?.accent_color ?? "#22D3EE",
  });

  const updateProfile = useMutation({
    mutationFn: async () => {
      const { error: pErr } = await supabase.from("profiles").update({ full_name: form.full_name }).eq("id", user.id);
      if (pErr) throw pErr;
      
      await updatePrefsFn({
        data: {
          theme_color: form.theme_color,
          accent_color: form.accent_color,
        }
      });
    },
    onSuccess: () => {
      toast.success("Perfil atualizado!");
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["profile-preferences"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao atualizar"),
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="font-display text-3xl font-bold">Meu Perfil</h1>

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
             <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center mb-2 border-2 border-dashed border-primary/30 relative group overflow-hidden">
                {prefs?.avatar_url ? (
                    <img src={prefs.avatar_url} className="w-full h-full object-cover" />
                ) : (
                    <User className="h-10 w-10 text-primary/40" />
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer">
                    <Camera className="h-6 w-6 text-white" />
                </div>
             </div>
             <p className="text-xs text-muted-foreground">Clique para alterar avatar</p>
          </div>

          <div className="space-y-2">
            <Label>Nome Completo</Label>
            <Input 
              value={form.full_name} 
              onChange={(e) => setForm(prev => ({ ...prev, full_name: e.target.value }))} 
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cor de Destaque (Tema)</Label>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={form.theme_color} 
                  onChange={(e) => setForm(prev => ({ ...prev, theme_color: e.target.value }))}
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
                  onChange={(e) => setForm(prev => ({ ...prev, accent_color: e.target.value }))}
                  className="h-10 w-20 rounded bg-transparent border-none cursor-pointer"
                />
                <span className="text-sm font-mono">{form.accent_color}</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-primary/20 bg-primary/5">
            <p className="text-xs text-muted-foreground mb-3 uppercase font-bold">Prévia da Aparência</p>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: form.theme_color }}>
                <Film className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold" style={{ color: form.theme_color }}>Seu Nome</span>
              <Badge style={{ backgroundColor: `${form.accent_color}20`, color: form.accent_color, borderColor: `${form.accent_color}40` }}>
                VIP
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button 
          size="lg" 
          className="glow-primary" 
          onClick={() => updateProfile.mutate()}
          disabled={updateProfile.isPending}
        >
          {updateProfile.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          Salvar Alterações
        </Button>
      </div>
    </div>
  );
}
