import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, Sparkles, ImageOff, Film, Tv, TestTube2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listWeeklyNews, broadcastWeeklyNews } from "@/lib/news.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/novidades")({
  component: NovidadesPage,
});

const KIND_LABEL: Record<string, string> = {
  adicao: "Adicionado",
  atualizacao: "Atualizado",
  conserto: "Consertado",
};

function NovidadesPage() {
  const { user } = Route.useRouteContext();
  const [days, setDays] = useState(7);
  const listFn = useServerFn(listWeeklyNews);
  const broadcastFn = useServerFn(broadcastWeeklyNews);

  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      return !!data;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["weekly-news", days],
    queryFn: () => listFn({ data: { days } }),
  });

  const broadcast = useMutation({
    mutationFn: (test_only: boolean) => broadcastFn({ data: { days, test_only } }),
    onSuccess: (r) =>
      toast.success(
        r.sent > 0
          ? `Enviado para ${r.sent} cliente(s)${r.failed ? ` · ${r.failed} falha(s)` : ""}`
          : "Nenhuma mensagem enviada",
      ),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao enviar"),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold inline-flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Novidades da semana
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Conteúdos concluídos nos últimos {days} dias.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={14}>Últimos 14 dias</option>
            <option value={30}>Últimos 30 dias</option>
          </select>
          {isAdmin && (
            <>
              <Button
                variant="outline"
                onClick={() => broadcast.mutate(true)}
                disabled={broadcast.isPending || !items.length}
                title="Envia só pro seu WhatsApp"
              >
                {broadcast.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <TestTube2 className="h-4 w-4 mr-2" />}
                Testar em mim
              </Button>
              <Button
                onClick={() => {
                  if (confirm(`Enviar novidades para TODOS os clientes ativos?`)) broadcast.mutate(false);
                }}
                disabled={broadcast.isPending || !items.length}
                className="glow-primary"
              >
                {broadcast.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Enviar no WhatsApp
              </Button>
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
        </div>
      ) : !items.length ? (
        <div className="glass-card rounded-xl p-8 text-center">
          <p className="text-muted-foreground">
            Nenhum conteúdo concluído no período. Assim que os pedidos forem finalizados eles aparecem aqui.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {items.map((i) => (
            <div key={i.request_id} className="group">
              <div className="aspect-[2/3] rounded-lg overflow-hidden bg-muted relative ring-1 ring-border/40 group-hover:ring-primary/60 transition">
                {i.poster_path ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w342${i.poster_path}`}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageOff className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <Badge className="absolute top-1.5 left-1.5 bg-black/70 backdrop-blur text-[10px] gap-1">
                  {i.content_type === "tv" ? <Tv className="h-3 w-3" /> : <Film className="h-3 w-3" />}
                  {i.content_type === "tv" ? "Série" : "Filme"}
                </Badge>
                <Badge className="absolute top-1.5 right-1.5 bg-emerald-500/80 text-[10px]">
                  {KIND_LABEL[i.request_kind] ?? "Novo"}
                </Badge>
              </div>
              <p className="text-sm font-medium truncate mt-2">{i.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {i.year ?? ""} · {new Date(i.completed_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
