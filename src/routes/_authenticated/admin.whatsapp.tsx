import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  MessageCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Power,
  Send,
  Trash2,
  QrCode,
  ArrowLeft,
  Plus,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getWhatsappStatus,
  createWhatsappInstance,
  disconnectWhatsapp,
  restartWhatsapp,
  deleteWhatsappInstance,
  sendWhatsappTest,
  saveWhatsappConfig,
  clearWhatsappConfig,
  getAdminWhatsappSetting,
  type WhatsappStatus,
} from "@/lib/whatsapp.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const WHATSAPP_PANEL_CONFIG_KEY = "portal_vod_whatsapp_panel_config";
const DEFAULT_WHATSAPP_INSTANCE = "portal-vod";

type PanelWhatsappConfig = {
  baseUrl: string;
  apiKey: string;
  instance: string;
};

function loadPanelWhatsappConfig(): PanelWhatsappConfig {
  if (typeof window === "undefined") return { baseUrl: "", apiKey: "", instance: DEFAULT_WHATSAPP_INSTANCE };
  try {
    const saved = window.localStorage.getItem(WHATSAPP_PANEL_CONFIG_KEY);
    if (!saved) return { baseUrl: "", apiKey: "", instance: DEFAULT_WHATSAPP_INSTANCE };
    const parsed = JSON.parse(saved) as Partial<PanelWhatsappConfig>;
    const savedInstance = parsed.instance?.trim();
    return {
      baseUrl: parsed.baseUrl ?? "",
      apiKey: parsed.apiKey ?? "",
      instance: savedInstance && savedInstance !== "portal" ? savedInstance : DEFAULT_WHATSAPP_INSTANCE,
    };
  } catch {
    return { baseUrl: "", apiKey: "", instance: DEFAULT_WHATSAPP_INSTANCE };
  }
}

function normalizePanelWhatsappConfig(config: PanelWhatsappConfig): PanelWhatsappConfig {
  return {
    baseUrl: config.baseUrl.trim(),
    apiKey: config.apiKey.trim(),
    instance: config.instance.trim(),
  };
}

function buildWhatsappPayload(config: PanelWhatsappConfig) {
  const normalized = normalizePanelWhatsappConfig(config);
  if (!normalized.baseUrl && !normalized.apiKey && !normalized.instance) return {};
  return { config: normalized };
}

function hasCompletePanelConfig(config: PanelWhatsappConfig) {
  const normalized = normalizePanelWhatsappConfig(config);
  return !!(normalized.baseUrl && normalized.apiKey && normalized.instance);
}

export const Route = createFileRoute("/_authenticated/admin/whatsapp")({
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
  component: WhatsappAdminPage,
});

function WhatsappAdminPage() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getWhatsappStatus);
  const createInst = useServerFn(createWhatsappInstance);
  const disconnect = useServerFn(disconnectWhatsapp);
  const restart = useServerFn(restartWhatsapp);
  const deleteInst = useServerFn(deleteWhatsappInstance);
  const sendTest = useServerFn(sendWhatsappTest);
  const saveCfgFn = useServerFn(saveWhatsappConfig);
  const clearCfgFn = useServerFn(clearWhatsappConfig);
  const fetchAdminNumber = useServerFn(getAdminWhatsappSetting);

  const [panelConfig, setPanelConfig] = useState<PanelWhatsappConfig>(loadPanelWhatsappConfig);
  const [appliedConfig, setAppliedConfig] = useState<PanelWhatsappConfig>(loadPanelWhatsappConfig);
  const [testNumber, setTestNumber] = useState("");
  const [testMessage, setTestMessage] = useState("Olá! Esta é uma mensagem de teste do Portal VOD. ✅");
  const [adminNumber, setAdminNumber] = useState("");

  useQuery({
    queryKey: ["admin-whatsapp-number"],
    queryFn: async () => {
      const res = await fetchAdminNumber();
      setAdminNumber(res.number ?? "");
      return res;
    },
  });

  const whatsappPayload = buildWhatsappPayload(appliedConfig);

  const { data: status, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["whatsapp-status", whatsappPayload],
    queryFn: () => fetchStatus({ data: whatsappPayload }),
    refetchInterval: (q) => {
      const s = q.state.data as WhatsappStatus | undefined;
      // Poll faster when waiting for QR scan
      if (!s?.configured) return false;
      if (s.state === "open") return 15000;
      return 4000;

    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["whatsapp-status"] });

  const savePanelConfig = async () => {
    const payload = buildWhatsappPayload(panelConfig);
    if (!hasCompletePanelConfig(panelConfig) || !payload.config) {
      toast.error("Preencha URL, chave e instância.");
      return;
    }
    const normalized = payload.config;
    setPanelConfig(normalized);
    setAppliedConfig(normalized);
    window.localStorage.setItem(WHATSAPP_PANEL_CONFIG_KEY, JSON.stringify(normalized));
    try {
      await saveCfgFn({
        data: {
          baseUrl: normalized.baseUrl,
          apiKey: normalized.apiKey,
          instance: normalized.instance,
          adminWhatsapp: adminNumber.trim(),
        },
      });
      toast.success("Configuração salva. Notificações automáticas ativadas.");
    } catch (err) {
      toast.error(
        "Aplicada no painel, mas não consegui salvar no servidor: " + (err as Error).message,
      );
    }
    invalidate();
  };

  const clearPanelConfig = async () => {
    window.localStorage.removeItem(WHATSAPP_PANEL_CONFIG_KEY);
    const emptyConfig = { baseUrl: "", apiKey: "", instance: DEFAULT_WHATSAPP_INSTANCE };
    setPanelConfig(emptyConfig);
    setAppliedConfig(emptyConfig);
    try {
      await clearCfgFn();
    } catch {
      /* ignore */
    }
    toast.success("Configuração removida.");
    invalidate();
  };


  const createMut = useMutation({
    mutationFn: () => createInst({ data: buildWhatsappPayload(panelConfig) }),
    onSuccess: () => {
      toast.success("Instância criada!");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const disconnectMut = useMutation({
    mutationFn: () => disconnect({ data: buildWhatsappPayload(panelConfig) }),
    onSuccess: () => {
      toast.success("Desconectado");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const restartMut = useMutation({
    mutationFn: () => restart({ data: buildWhatsappPayload(panelConfig) }),
    onSuccess: () => {
      toast.success("Reiniciando...");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteInst({ data: buildWhatsappPayload(panelConfig) }),
    onSuccess: () => {
      toast.success("Instância removida");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const testMut = useMutation({
    mutationFn: () => sendTest({ data: { number: testNumber, message: testMessage, ...buildWhatsappPayload(panelConfig) } }),
    onSuccess: () => toast.success("Mensagem enviada!"),
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Voltar
            </Link>
          </Button>
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold flex items-center gap-2">
              <MessageCircle className="h-7 w-7 text-primary" />
              WhatsApp
            </h1>
            <p className="text-sm text-muted-foreground">
              Recomendado: deixe o site no Lovable e use a VPS apenas para a Evolution API.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <PanelConfigCard
        config={panelConfig}
        source={hasCompletePanelConfig(appliedConfig) ? "panel" : status?.configSource}
        onChange={setPanelConfig}
        onSave={savePanelConfig}
        onClear={clearPanelConfig}
      />

      {isLoading ? (
        <div className="glass-card rounded-2xl p-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !status?.configured ? (
        <NotConfiguredCard message={status?.message} />
      ) : (
        <>
          <StatusCard status={status} />

          {status.state === "not_found" && (
            <ActionCard
              icon={<Plus className="h-5 w-5" />}
              title="Criar instância"
              description={`A instância "${status.instance}" ainda não existe na Evolution API. Clique abaixo para criá-la.`}
              action={
                <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                  {createMut.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Criar instância
                </Button>
              }
            />
          )}

          {(status.state === "close" || status.state === "connecting" || status.state === "unknown") && (
            <QrCard status={status} onRestart={() => restartMut.mutate()} restarting={restartMut.isPending} />
          )}

          {status.state === "open" && (
            <>
              <TestMessageCard
                number={testNumber}
                message={testMessage}
                onNumberChange={setTestNumber}
                onMessageChange={setTestMessage}
                onSend={() => testMut.mutate()}
                sending={testMut.isPending}
              />

              <DangerZone
                onDisconnect={() => {
                  if (confirm("Desconectar o WhatsApp? Você precisará escanear o QR novamente.")) {
                    disconnectMut.mutate();
                  }
                }}
                disconnecting={disconnectMut.isPending}
                onDelete={() => {
                  if (
                    confirm(
                      "Remover a instância COMPLETAMENTE? Isso apaga todos os dados de sessão. Você precisará criar de novo depois.",
                    )
                  ) {
                    deleteMut.mutate();
                  }
                }}
                deleting={deleteMut.isPending}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function PanelConfigCard({
  config,
  source,
  onChange,
  onSave,
  onClear,
}: {
  config: PanelWhatsappConfig;
  source?: WhatsappStatus["configSource"];
  onChange: (config: PanelWhatsappConfig) => void;
  onSave: () => void;
  onClear: () => void;
}) {
  const hasPanelConfig = !!buildWhatsappPayload(config).config;
  const isComplete = hasCompletePanelConfig(config);

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-bold">Configuração da Evolution API</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Preencha aqui para gerar o QR Code na VPS sem depender do PM2 ler o arquivo .env.
          </p>
        </div>
        <Badge variant="outline">
          {source === "panel" ? "Usando painel" : "Usando servidor"}
        </Badge>
      </div>
      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr_0.7fr]">
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            URL da API
          </label>
          <Input
            placeholder="http://163.245.196.13:8080"
            value={config.baseUrl}
            onChange={(e) => onChange({ ...config, baseUrl: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Chave API
          </label>
          <Input
            type="text"
            placeholder="Sua chave da Evolution"
            value={config.apiKey}
            onChange={(e) => onChange({ ...config, apiKey: e.target.value })}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Instância
          </label>
          <Input
            placeholder="portal-vod"
            value={config.instance}
            onChange={(e) => onChange({ ...config, instance: e.target.value })}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 flex-wrap">
        <Button variant="outline" onClick={onClear} disabled={!hasPanelConfig}>
          Limpar
        </Button>
        <Button onClick={onSave}>
          {isComplete ? "Aplicar e conectar" : "Aplicar configuração"}
        </Button>
      </div>
    </div>
  );
}

function NotConfiguredCard({ message }: { message?: string }) {
  return (
    <div className="glass-card rounded-2xl p-8">
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-destructive/15 flex items-center justify-center shrink-0">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <div className="space-y-3 flex-1">
          <div>
            <h2 className="font-display text-xl font-bold">Evolution API não configurada</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {message ?? "Adicione as 3 chaves de configuração para conectar seu WhatsApp."}
            </p>
          </div>
          <div className="rounded-lg bg-muted/30 border border-border/40 p-4 space-y-2 text-sm">
            <p className="font-medium">Use a forma mais simples:</p>
            <ul className="space-y-1 text-muted-foreground font-mono text-xs">
              <li>• Preencha os campos acima e clique em <code className="text-foreground">Aplicar e conectar</code></li>
              <li>• Se aparecer erro, ele vai mostrar se é URL, chave, instância ou conexão</li>
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            Na VPS, a forma mais simples é preencher os campos acima com a URL, chave e instância.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ status }: { status: WhatsappStatus }) {
  const config: Record<
    WhatsappStatus["state"],
    { label: string; color: string; icon: React.ReactNode }
  > = {
    open: {
      label: "Conectado",
      color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    connecting: {
      label: "Conectando...",
      color: "bg-amber-500/15 text-amber-500 border-amber-500/30",
      icon: <Loader2 className="h-4 w-4 animate-spin" />,
    },
    close: {
      label: "Desconectado",
      color: "bg-destructive/15 text-destructive border-destructive/30",
      icon: <XCircle className="h-4 w-4" />,
    },
    not_found: {
      label: "Instância não existe",
      color: "bg-muted text-muted-foreground border-border",
      icon: <AlertCircle className="h-4 w-4" />,
    },
    unknown: {
      label: "Desconhecido",
      color: "bg-muted text-muted-foreground border-border",
      icon: <AlertCircle className="h-4 w-4" />,
    },
  };
  const c = config[status.state];

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          {status.profilePictureUrl ? (
            <img
              src={status.profilePictureUrl}
              alt={status.profileName ?? "avatar"}
              className="h-14 w-14 rounded-full border border-border/40"
            />
          ) : (
            <div className="h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center">
              <MessageCircle className="h-7 w-7 text-primary" />
            </div>
          )}
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Instância: <span className="font-mono text-foreground">{status.instance}</span>
            </div>
            <div className="text-lg font-semibold mt-0.5">
              {status.profileName ?? (status.state === "open" ? "Conectado" : "Aguardando conexão")}
            </div>
            {status.ownerJid && (
              <div className="text-xs text-muted-foreground font-mono">
                {status.ownerJid.replace("@s.whatsapp.net", "")}
              </div>
            )}
          </div>
        </div>
        <Badge className={`${c.color} border gap-1.5 py-1.5 px-3`}>
          {c.icon}
          {c.label}
        </Badge>
      </div>
      {status.message && (
        <p className="text-sm text-muted-foreground mt-4 pt-4 border-t border-border/40">
          {status.message}
        </p>
      )}
      <div className="mt-4 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
        <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
          <span className="block uppercase tracking-wider mb-1">Origem</span>
          <strong className="text-foreground">{status.configSource === "panel" ? "Painel" : "Servidor"}</strong>
        </div>
        <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
          <span className="block uppercase tracking-wider mb-1">URL</span>
          <strong className="text-foreground break-all">{status.endpoint ?? "Não informada"}</strong>
        </div>
        <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
          <span className="block uppercase tracking-wider mb-1">Instância</span>
          <strong className="text-foreground break-all">{status.instance || "Não informada"}</strong>
        </div>
      </div>
    </div>
  );
}

function QrCard({
  status,
  onRestart,
  restarting,
}: {
  status: WhatsappStatus;
  onRestart: () => void;
  restarting: boolean;
}) {
  const qrSrc = status.qrCode
    ? status.qrCode.startsWith("data:")
      ? status.qrCode
      : `data:image/png;base64,${status.qrCode}`
    : null;

  return (
    <div className="glass-card rounded-2xl p-6 md:p-8">
      <div className="flex flex-col md:flex-row gap-8 items-center">
        <div className="shrink-0">
          {qrSrc ? (
            <div className="bg-white p-4 rounded-xl shadow-lg glow-primary">
              <img src={qrSrc} alt="QR Code WhatsApp" className="w-64 h-64 block" />
            </div>
          ) : status.message ? (
            <div className="w-64 min-h-64 rounded-xl bg-destructive/10 border border-destructive/30 flex flex-col items-center justify-center gap-3 p-4 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <span className="text-xs text-destructive leading-relaxed">{status.message}</span>
            </div>
          ) : (
            <div className="w-64 h-64 rounded-xl bg-muted/30 border-2 border-dashed border-border flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Gerando QR Code...</span>
            </div>
          )}
        </div>
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            <h2 className="font-display text-xl font-bold">Escaneie para conectar</h2>
          </div>
          <ol className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <span className="shrink-0 h-6 w-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold">1</span>
              Abra o <strong className="text-foreground">WhatsApp</strong> no celular que vai enviar as notificações.
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 h-6 w-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold">2</span>
              Toque em <strong className="text-foreground">Configurações → Aparelhos conectados → Conectar um aparelho</strong>.
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 h-6 w-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold">3</span>
              Aponte a câmera para este QR Code.
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 h-6 w-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold">4</span>
              A página atualiza sozinha quando conectar. ✨
            </li>
          </ol>
          {status.pairingCode && (
            <div className="rounded-lg bg-muted/30 border border-border/40 p-3">
              <div className="text-xs text-muted-foreground mb-1">Ou use o código:</div>
              <div className="font-mono text-lg font-bold tracking-widest">{status.pairingCode}</div>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={onRestart} disabled={restarting}>
            {restarting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Gerar novo QR
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center text-primary shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-[200px]">
          <h3 className="font-semibold text-lg">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        <div>{action}</div>
      </div>
    </div>
  );
}

function TestMessageCard({
  number,
  message,
  onNumberChange,
  onMessageChange,
  onSend,
  sending,
}: {
  number: string;
  message: string;
  onNumberChange: (v: string) => void;
  onMessageChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
}) {
  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Send className="h-5 w-5 text-primary" />
        <h2 className="font-display text-xl font-bold">Enviar mensagem de teste</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Número (com DDI)
          </label>
          <Input
            placeholder="5511999999999"
            value={number}
            onChange={(e) => onNumberChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Mensagem
          </label>
          <Textarea
            rows={3}
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={onSend} disabled={sending || !number || !message}>
          {sending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Enviar
        </Button>
      </div>
    </div>
  );
}

function DangerZone({
  onDisconnect,
  disconnecting,
  onDelete,
  deleting,
}: {
  onDisconnect: () => void;
  disconnecting: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div className="glass-card rounded-2xl p-6 border-destructive/30">
      <h2 className="font-display text-lg font-bold text-destructive/90 mb-4">
        Zona de perigo
      </h2>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-medium">Desconectar WhatsApp</div>
            <div className="text-sm text-muted-foreground">
              Encerra a sessão. Você precisará escanear o QR de novo.
            </div>
          </div>
          <Button variant="outline" onClick={onDisconnect} disabled={disconnecting}>
            {disconnecting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Power className="h-4 w-4 mr-2" />
            )}
            Desconectar
          </Button>
        </div>
        <div className="flex items-center justify-between gap-4 flex-wrap pt-3 border-t border-border/40">
          <div>
            <div className="font-medium text-destructive">Excluir instância</div>
            <div className="text-sm text-muted-foreground">
              Apaga tudo na Evolution API. Só use se quiser recomeçar do zero.
            </div>
          </div>
          <Button variant="destructive" onClick={onDelete} disabled={deleting}>
            {deleting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Excluir
          </Button>
        </div>
      </div>
    </div>
  );
}
