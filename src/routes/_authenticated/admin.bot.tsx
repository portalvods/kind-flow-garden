import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, Loader2, RefreshCw, Copy, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getBotConfig,
  saveBotConfig,
  rotateBotSecret,
} from "@/lib/admin-extras.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin/bot")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!data) throw redirect({ to: "/pedidos" });
  },
  component: BotPage,
});

function BotPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getBotConfig);
  const saveFn = useServerFn(saveBotConfig);
  const rotateFn = useServerFn(rotateBotSecret);

  const { data, isLoading } = useQuery({
    queryKey: ["bot-config"],
    queryFn: () => getFn(),
  });

  const [enabled, setEnabled] = useState(false);
  const [ordersEnabled, setOrdersEnabled] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (data) {
      setEnabled(data.enabled);
      setOrdersEnabled(data.ordersEnabled);
      setMessage(data.message);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { enabled, ordersEnabled, message } }),
    onSuccess: () => {
      toast.success("Bot atualizado.");
      qc.invalidateQueries({ queryKey: ["bot-config"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const rotate = useMutation({
    mutationFn: () => rotateFn(),
    onSuccess: () => {
      toast.success("Nova chave gerada. Reconfigure o webhook na Evolution.");
      qc.invalidateQueries({ queryKey: ["bot-config"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = data?.secret ? `${origin}/api/public/webhooks/evolution?secret=${data.secret}` : "";

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <Bot className="h-7 w-7 text-primary" /> Bot de recebimento
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Responde automaticamente quando um contato manda mensagem no seu WhatsApp.
        </p>
      </div>

      {isLoading ? (
        <div className="glass-card rounded-2xl p-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="glass-card rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-base font-semibold">Bot ativado</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Quando ligado, responde 1x por hora para cada contato.
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="space-y-2">
              <Label>Mensagem automática</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                maxLength={1000}
                placeholder="Olá! Recebemos sua mensagem..."
              />
              <p className="text-xs text-muted-foreground">{message.length}/1000</p>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => save.mutate()} disabled={save.isPending || !message.trim()}>
                {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="font-display text-lg font-bold">Webhook da Evolution API</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Cole esta URL na Evolution (Instância → Webhooks) e habilite o evento{" "}
                <code className="text-foreground">MESSAGES_UPSERT</code>.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">URL do webhook</Label>
              <div className="flex gap-2">
                <Input value={webhookUrl} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={() => copy(webhookUrl)} disabled={!webhookUrl}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="rounded-lg bg-muted/30 border border-border/40 p-4 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Como configurar na Evolution:</p>
              <ol className="list-decimal ml-4 space-y-1">
                <li>Acesse o painel da sua Evolution API.</li>
                <li>Abra sua instância e vá em <strong>Webhooks</strong>.</li>
                <li>Cole a URL acima, marque <strong>Events → MESSAGES_UPSERT</strong> e salve.</li>
                <li>Pronto! Toda mensagem recebida vai gerar uma resposta automática.</li>
              </ol>
            </div>

            <div className="flex justify-between items-center gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground">
                Se alguém pegar a URL, rotacione a chave para invalidá-la.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm("Gerar nova chave secreta? O webhook antigo vai parar de funcionar até você reconfigurar.")) {
                    rotate.mutate();
                  }
                }}
                disabled={rotate.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${rotate.isPending ? "animate-spin" : ""}`} />
                Rotacionar chave
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
