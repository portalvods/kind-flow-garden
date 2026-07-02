import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Bot, Loader2, Sparkles, Check, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getAiAutomation,
  setAiAutomation,
  analyzeTemplate,
  applyMatches,
} from "@/lib/ai-match.functions";

export const Route = createFileRoute("/_authenticated/admin/automacao")({
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
  component: AutomationPage,
});

type Match = {
  request_id: string;
  request_title: string;
  request_year: number | null;
  request_kind: string | null;
  status: string;
  user_name: string | null;
  whatsapp: string | null;
  matched_title: string;
  matched_year: number | null;
};

const KIND_LABEL: Record<string, string> = {
  adicao: "Adição",
  atualizacao: "Atualização",
  conserto: "Conserto",
};

function AutomationPage() {
  const qc = useQueryClient();
  const getAuto = useServerFn(getAiAutomation);
  const setAuto = useServerFn(setAiAutomation);
  const analyzeFn = useServerFn(analyzeTemplate);
  const applyFn = useServerFn(applyMatches);

  const [text, setText] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [extractedCount, setExtractedCount] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: auto } = useQuery({
    queryKey: ["ai-automation"],
    queryFn: () => getAuto(),
  });

  const toggleAuto = useMutation({
    mutationFn: (enabled: boolean) => setAuto({ data: { enabled } }),
    onSuccess: (_, enabled) => {
      qc.invalidateQueries({ queryKey: ["ai-automation"] });
      toast.success(enabled ? "IA ligada" : "IA desligada");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro"),
  });

  const analyze = useMutation({
    mutationFn: () => analyzeFn({ data: { template_text: text } }),
    onSuccess: (res) => {
      setMatches(res.matches);
      setExtractedCount(res.extracted.length);
      setSelected(new Set(res.matches.map((m) => m.request_id)));
      if (res.matches.length === 0) {
        toast.info("Nenhum pedido pendente corresponde a esse template.");
      } else {
        toast.success(`${res.matches.length} pedido(s) casaram. Aplicando automaticamente...`);
        // Auto-apply: com a IA ligada, conclui e notifica sem confirmação manual
        apply.mutate(res.matches.map((m) => m.request_id));
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao analisar"),
  });


  const apply = useMutation({
    mutationFn: (ids: string[]) => applyFn({ data: { request_ids: ids } }),
    onSuccess: (res) => {
      toast.success(
        `${res.updated} pedido(s) marcados como concluídos. ${res.notified} cliente(s) notificados.`,
      );
      setMatches(null);
      setExtractedCount(0);
      setSelected(new Set());
      setText("");
      qc.invalidateQueries({ queryKey: ["admin-requests"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao aplicar"),
  });

  const allSelected = useMemo(
    () => matches !== null && matches.length > 0 && selected.size === matches.length,
    [matches, selected],
  );

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!matches) return;
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(matches.map((m) => m.request_id)));
  };

  const enabled = auto?.enabled ?? false;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <Bot className="h-7 w-7 text-primary" />
          Automação por IA
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Cole o template de conteúdos adicionados/atualizados. A IA identifica os títulos,
          cruza com os pedidos em aberto, e você confirma para marcar como concluído e notificar
          os clientes automaticamente no WhatsApp.
        </p>
      </div>

      {/* Toggle */}
      <div className="glass-card rounded-2xl p-5 flex items-center justify-between">
        <div>
          <div className="font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Automação por IA
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Quando ligada, você pode usar esta página. Se desligada, siga marcando os pedidos
            manualmente no painel.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {enabled ? "Ligada" : "Desligada"}
          </span>
          <Switch
            checked={enabled}
            disabled={toggleAuto.isPending}
            onCheckedChange={(v) => toggleAuto.mutate(v)}
          />
        </div>
      </div>

      {!enabled && (
        <div className="glass-card rounded-2xl p-6 text-sm text-muted-foreground flex gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0" />
          <div>
            Ligue a automação por IA acima para colar um template e processar os pedidos
            automaticamente. Enquanto estiver desligada, use o painel principal para marcar
            pedidos como concluídos manualmente.
          </div>
        </div>
      )}

      {enabled && (
        <>
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <label className="text-sm font-medium">Template dos conteúdos adicionados/atualizados</label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Cole aqui o template, ex:\n\n🎬 ADICIONADOS\n- Duna: Parte 2 (2024)\n- Coringa: Delírio a Dois (2024)\n\n📺 ATUALIZADOS\n- The Boys — T4\n- One Piece — Novos episódios`}
              rows={12}
              maxLength={30000}
              className="font-mono text-sm"
            />
            <div className="flex items-center gap-3 justify-between flex-wrap">
              <span className="text-xs text-muted-foreground">
                {text.length}/30000 caracteres
              </span>
              <Button
                onClick={() => analyze.mutate()}
                disabled={analyze.isPending || text.trim().length < 5}
              >
                {analyze.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Sparkles className="h-4 w-4 mr-2" />
                Analisar com IA
              </Button>
            </div>
          </div>

          {matches !== null && (
            <div className="glass-card rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="font-semibold">Resultados</div>
                  <p className="text-xs text-muted-foreground">
                    IA extraiu {extractedCount} título(s) do template. {matches.length} coincidiram
                    com pedidos em aberto.
                  </p>
                </div>
                {matches.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={toggleAll}>
                      {allSelected ? "Desmarcar tudo" : "Selecionar tudo"}
                    </Button>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-500"
                      disabled={selected.size === 0 || apply.isPending}
                      onClick={() => apply.mutate(Array.from(selected))}
                    >
                      {apply.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      <Check className="h-4 w-4 mr-2" />
                      Concluir e notificar ({selected.size})
                    </Button>
                  </div>
                )}
              </div>

              {matches.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Nenhum pedido em aberto corresponde aos títulos do template.
                </div>
              ) : (
                <div className="space-y-2">
                  {matches.map((m) => {
                    const isChecked = selected.has(m.request_id);
                    return (
                      <label
                        key={m.request_id}
                        className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          isChecked
                            ? "border-primary/40 bg-primary/5"
                            : "border-border/50 hover:bg-accent/5"
                        }`}
                      >
                        <Checkbox checked={isChecked} onCheckedChange={() => toggleOne(m.request_id)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{m.request_title}</span>
                            {m.request_year && (
                              <span className="text-xs text-muted-foreground">
                                {m.request_year}
                              </span>
                            )}
                            {m.request_kind && (
                              <Badge variant="outline" className="text-[10px]">
                                {KIND_LABEL[m.request_kind] ?? m.request_kind}
                              </Badge>
                            )}
                            <Badge variant="secondary" className="text-[10px]">
                              {m.status}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            👤 {m.user_name ?? "—"}
                            {m.whatsapp && ` · 📱 ${m.whatsapp}`}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            IA identificou: <span className="text-foreground">{m.matched_title}</span>
                            {m.matched_year ? ` (${m.matched_year})` : ""}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
