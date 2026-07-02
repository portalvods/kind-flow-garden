import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, Trash2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPublicSettings, uploadLogo, clearLogo, updateSiteName, getAdminDailyLimit, updateDailyLimit } from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/admin/aparencia")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!data) throw redirect({ to: "/pedidos" });
  },
  component: AppearancePage,
});

function AppearancePage() {
  const qc = useQueryClient();
  const settingsFn = useServerFn(getPublicSettings);
  const uploadFn = useServerFn(uploadLogo);
  const clearFn = useServerFn(clearLogo);
  const nameFn = useServerFn(updateSiteName);
  const getLimitFn = useServerFn(getAdminDailyLimit);
  const updLimitFn = useServerFn(updateDailyLimit);

  const { data: limitData } = useQuery({
    queryKey: ["admin-daily-limit"],
    queryFn: () => getLimitFn(),
  });
  const [dailyLimit, setDailyLimit] = useState<string>("");

  const saveLimit = useMutation({
    mutationFn: async () => updLimitFn({ data: { limit: Number(dailyLimit) } }),
    onSuccess: () => {
      toast.success("Limite atualizado.");
      qc.invalidateQueries({ queryKey: ["admin-daily-limit"] });
      qc.invalidateQueries({ queryKey: ["my-daily-limit"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro"),
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["public-settings"],
    queryFn: () => settingsFn(),
  });

  const [siteName, setSiteName] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) return toast.error("Arquivo muito grande (máx 2MB).");
    setUploading(true);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const s = reader.result as string;
          resolve(s.split(",")[1] ?? "");
        };
        reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
        reader.readAsDataURL(file);
      });
      await uploadFn({
        data: { filename: file.name, content_type: file.type || "image/png", data_base64: b64 },
      });
      toast.success("Logo atualizada!");
      qc.invalidateQueries({ queryKey: ["public-settings"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  const clearLogoM = useMutation({
    mutationFn: async () => clearFn({}),
    onSuccess: () => {
      toast.success("Logo removida.");
      qc.invalidateQueries({ queryKey: ["public-settings"] });
    },
  });

  const saveName = useMutation({
    mutationFn: async () => nameFn({ data: { site_name: siteName } }),
    onSuccess: () => {
      toast.success("Nome atualizado.");
      qc.invalidateQueries({ queryKey: ["public-settings"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Aparência</h1>
        <p className="text-muted-foreground text-sm mt-1">Personalize logo e nome do portal.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <h2 className="font-display font-semibold text-lg">Logo do portal</h2>
            <div className="flex items-center gap-6">
              <div className="h-24 w-24 rounded-2xl bg-muted/40 border border-border/60 flex items-center justify-center overflow-hidden">
                {settings?.logo_url ? (
                  <img src={settings.logo_url} alt="logo" className="max-h-20 max-w-20 object-contain" />
                ) : (
                  <span className="text-xs text-muted-foreground">sem logo</span>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="logo-file" className="inline-flex items-center gap-2 cursor-pointer">
                  <Button asChild disabled={uploading}>
                    <span>
                      {uploading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      Enviar nova logo
                    </span>
                  </Button>
                </Label>
                <input
                  id="logo-file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = "";
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  PNG, JPG, WEBP ou SVG. Máx 2MB. Recomendado 400×400.
                </p>
                {settings?.logo_url && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => clearLogoM.mutate()}
                    disabled={clearLogoM.isPending}
                    className="text-red-400"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remover logo
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6 space-y-4">
            <h2 className="font-display font-semibold text-lg">Nome do portal</h2>
            <div className="flex gap-2 items-end max-w-md">
              <div className="flex-1">
                <Label htmlFor="site-name">Nome exibido no topo</Label>
                <Input
                  id="site-name"
                  defaultValue={settings?.site_name ?? "Portal VOD"}
                  onChange={(e) => setSiteName(e.target.value)}
                  maxLength={60}
                />
              </div>
              <Button
                onClick={() => saveName.mutate()}
                disabled={!siteName || saveName.isPending}
              >
                {saveName.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
