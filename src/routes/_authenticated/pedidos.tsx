import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Search, Loader2, Plus, Film, Tv, ImageOff, X, CheckCircle2, ThumbsUp, ThumbsDown, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { searchTmdb, type TmdbResult } from "@/lib/tmdb.functions";
import { createRequest } from "@/lib/requests.functions";
import { rateRequest } from "@/lib/rating.functions";
import { getDailyLimit } from "@/lib/settings.functions";
import { getRequestTimeline } from "@/lib/admin-extras.functions";
import { suggestAlternatives } from "@/lib/suggest.functions";

import { checkAvailability } from "@/lib/catalog.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/pedidos")({
  component: PedidosPage,
});

const STATUS_LABEL: Record<string, string> = {
  pending: "Recebido",
  analyzing: "Em análise",
  processing: "Em andamento",
  approved: "Aprovado",
  added: "Adicionado",
  completed: "Concluído",
  fixed: "Consertado",
  rejected: "Recusado",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  analyzing: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  processing: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  approved: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  added: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  fixed: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  rejected: "bg-red-500/15 text-red-400 border-red-500/30",
};
const KIND_LABEL: Record<string, string> = {
  adicao: "Adição",
  atualizacao: "Atualização",
  conserto: "Conserto",
};

function PedidosPage() {
  const { user } = Route.useRouteContext();
  const [tab, setTab] = useState<"all" | "pending" | "processing" | "added" | "rejected">("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: requests, isLoading } = useQuery({
    queryKey: ["my-requests", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const limitFn = useServerFn(getDailyLimit);
  const { data: quota } = useQuery({
    queryKey: ["my-daily-limit", user.id],
    queryFn: () => limitFn(),
  });

  const filtered = (requests ?? []).filter((r) => tab === "all" || r.status === tab);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Meus pedidos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Solicite filmes e séries e acompanhe o status.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {quota && (
            <Badge
              variant="outline"
              className={
                quota.remaining === 0
                  ? "border-red-500/40 text-red-300"
                  : "border-primary/40 text-primary"
              }
            >
              {quota.used}/{quota.limit} pedidos hoje
            </Badge>
          )}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="glow-primary" disabled={quota?.remaining === 0}>
                <Plus className="h-4 w-4 mr-2" />
                Novo pedido
              </Button>
            </DialogTrigger>
            <NewRequestDialog onDone={() => setDialogOpen(false)} />
          </Dialog>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="bg-card/60 border border-border/60">
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="pending">Pendentes</TabsTrigger>
          <TabsTrigger value="processing">Em andamento</TabsTrigger>
          <TabsTrigger value="added">Adicionados</TabsTrigger>
          <TabsTrigger value="rejected">Recusados</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-6">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState onNew={() => setDialogOpen(true)} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((r) => (
                <RequestCard key={r.id} request={r} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="glass-card rounded-2xl p-12 text-center">
      <div className="h-14 w-14 rounded-2xl bg-primary/15 text-primary flex items-center justify-center mx-auto mb-4">
        <Film className="h-6 w-6" />
      </div>
      <h3 className="font-display font-semibold text-lg mb-1">Nenhum pedido por aqui</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Faça seu primeiro pedido de filme ou série.
      </p>
      <Button onClick={onNew}>
        <Plus className="h-4 w-4 mr-2" />
        Fazer pedido
      </Button>
    </div>
  );
}

type RequestRow = {
  id: string;
  title: string;
  content_type: "movie" | "tv";
  request_kind: string | null;
  format: string | null;
  poster_path: string | null;
  year: number | null;
  status: string;
  notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  rating?: number | null;
};

function RequestCard({ request }: { request: RequestRow }) {
  const qc = useQueryClient();
  const rateFn = useServerFn(rateRequest);
  const rate = useMutation({
    mutationFn: (rating: 1 | -1) => rateFn({ data: { id: request.id, rating } }),
    onSuccess: () => {
      toast.success("Obrigado pela avaliação!");
      qc.invalidateQueries({ queryKey: ["my-requests"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro"),
  });
  const canRate = ["completed", "fixed", "added"].includes(request.status) && !request.rating;

  const poster = request.poster_path
    ? `https://image.tmdb.org/t/p/w500${request.poster_path}`
    : null;
  return (
    <div className="glass-card rounded-2xl overflow-hidden group hover:border-primary/40 transition">
      <div className="aspect-[2/3] bg-muted relative overflow-hidden">
        {poster ? (
          <img
            src={poster}
            alt={request.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <ImageOff className="h-10 w-10" />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <Badge className={`${STATUS_COLOR[request.status] ?? ""} border`}>
            {STATUS_LABEL[request.status] ?? request.status}
          </Badge>
        </div>
        <div className="absolute top-2 right-2">
          <Badge variant="secondary" className="bg-black/60 backdrop-blur">
            {request.content_type === "movie" ? (
              <><Film className="h-3 w-3 mr-1" /> Filme</>
            ) : (
              <><Tv className="h-3 w-3 mr-1" /> Série</>
            )}
          </Badge>
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-semibold line-clamp-1">{request.title}</h3>
        <p className="text-xs text-muted-foreground mt-1">
          {request.year ?? "—"} · {new Date(request.created_at).toLocaleDateString("pt-BR")}
        </p>
        <div className="flex gap-1 flex-wrap mt-2">
          {request.request_kind && (
            <Badge variant="outline" className="text-[10px]">
              {KIND_LABEL[request.request_kind] ?? request.request_kind}
            </Badge>
          )}
          {request.format && (
            <Badge variant="outline" className="text-[10px]">{request.format}</Badge>
          )}
        </div>
        {request.notes && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">📝 {request.notes}</p>
        )}
        {request.rejection_reason && (
          <p className="text-xs text-red-400 mt-2 line-clamp-2">Motivo: {request.rejection_reason}</p>
        )}
        {canRate && (
          <div className="mt-3 pt-3 border-t border-border/40 flex items-center gap-2">
            <span className="text-xs text-muted-foreground flex-1">Este pedido foi útil?</span>
            <Button
              size="sm"
              variant="outline"
              disabled={rate.isPending}
              onClick={() => rate.mutate(1)}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={rate.isPending}
              onClick={() => rate.mutate(-1)}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {request.rating != null && (
          <div className="mt-3 pt-3 border-t border-border/40 text-xs text-muted-foreground flex items-center gap-1.5">
            {request.rating > 0 ? (
              <><ThumbsUp className="h-3.5 w-3.5 text-emerald-400" /> Avaliado</>
            ) : (
              <><ThumbsDown className="h-3.5 w-3.5 text-red-400" /> Avaliado</>
            )}
          </div>
        )}
        <TimelineToggle requestId={request.id} />
      </div>
    </div>
  );
}

const TIMELINE_LABEL: Record<string, string> = {
  pending: "Recebido",
  analyzing: "Em análise",
  processing: "Em andamento",
  approved: "Aprovado",
  added: "Adicionado",
  completed: "Concluído",
  fixed: "Consertado",
  rejected: "Recusado",
};

function TimelineToggle({ requestId }: { requestId: string }) {
  const [open, setOpen] = useState(false);
  const fetchFn = useServerFn(getRequestTimeline);
  const { data, isLoading } = useQuery({
    queryKey: ["timeline", requestId],
    queryFn: () => fetchFn({ data: { requestId } }),
    enabled: open,
  });
  return (
    <div className="mt-3 pt-3 border-t border-border/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
      >
        <History className="h-3.5 w-3.5" />
        {open ? "Ocultar histórico" : "Ver histórico"}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {isLoading ? (
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> carregando...
            </p>
          ) : !data?.events?.length ? (
            <p className="text-xs text-muted-foreground">Sem alterações registradas ainda.</p>
          ) : (
            data.events.map((e, i) => (
              <div key={i} className="text-[11px] flex gap-2">
                <span className="text-muted-foreground shrink-0">
                  {new Date(e.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span>
                  <span className="text-muted-foreground">{TIMELINE_LABEL[e.from_status] ?? e.from_status}</span>
                  {" → "}
                  <span className="text-foreground font-medium">{TIMELINE_LABEL[e.to_status] ?? e.to_status}</span>
                  {e.note && <span className="text-muted-foreground"> · {e.note}</span>}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}


function NewRequestDialog({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TmdbResult | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualType, setManualType] = useState<"movie" | "tv">("movie");
  const [kind, setKind] = useState<"adicao" | "atualizacao" | "conserto">("adicao");
  const [format, setFormat] = useState<string>("");
  const [notes, setNotes] = useState("");
  const searchFn = useServerFn(searchTmdb);
  const createFn = useServerFn(createRequest);
  const availFn = useServerFn(checkAvailability);
  const suggestFn = useServerFn(suggestAlternatives);

  const { data: search, isFetching } = useQuery({
    queryKey: ["tmdb", query],
    queryFn: () => searchFn({ data: { query } }),
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
  });

  const { data: availability, isFetching: checkingAvail } = useQuery({
    queryKey: ["avail", selected?.type, selected?.id, selected?.title, selected?.year, kind],
    queryFn: () =>
      availFn({
        data: {
          tmdb_id: selected!.id,
          title: selected!.title,
          year: selected!.year,
          kind: selected!.type === "tv" ? "series" : "movie",
        },
      }),
    enabled: !!selected && kind === "adicao",
    staleTime: 30_000,
  });

  // Similar-title suggestions (fuzzy) — only when kind=adicao and no exact catalog match.
  const suggestTitle = selected?.title ?? (manualTitle.trim().length >= 3 ? manualTitle.trim() : "");
  const suggestKind: "movie" | "series" | undefined = selected
    ? selected.type === "tv" ? "series" : "movie"
    : manualTitle.trim().length >= 3 ? (manualType === "tv" ? "series" : "movie") : undefined;
  const { data: suggestions } = useQuery({
    queryKey: ["suggest", suggestTitle, suggestKind, kind],
    queryFn: () => suggestFn({ data: { title: suggestTitle, kind: suggestKind, limit: 3 } }),
    enabled: kind === "adicao" && suggestTitle.length >= 3 && !availability?.exists,
    staleTime: 30_000,
  });


  const blockedByCatalog = kind === "adicao" && availability?.exists === true;

  const create = useMutation({
    mutationFn: async () => {
      const base = {
        request_kind: kind,
        format: format || null,
        notes: notes || null,
      };
      const payload = selected
        ? {
            ...base,
            title: selected.title,
            content_type: selected.type,
            tmdb_id: selected.id,
            poster_path: selected.poster_path,
            year: selected.year,
            overview: selected.overview,
          }
        : {
            ...base,
            title: manualTitle,
            content_type: manualType,
            tmdb_id: null,
            poster_path: null,
            year: null,
            overview: null,
          };
      return createFn({ data: payload });
    },
    onSuccess: () => {
      toast.success("Pedido enviado! O administrador foi notificado.");
      qc.invalidateQueries({ queryKey: ["my-requests"] });
      qc.invalidateQueries({ queryKey: ["my-daily-limit"] });
      onDone();
      setQuery("");
      setSelected(null);
      setManualTitle("");
      setNotes("");
      setFormat("");
      setKind("adicao");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao enviar"),
  });


  const canSubmit = (selected !== null || manualTitle.trim().length >= 2) && !blockedByCatalog;

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="font-display text-xl">Novo pedido</DialogTitle>
      </DialogHeader>

      {selected ? (
        <div className="glass-card rounded-xl p-4 flex gap-4">
          {selected.poster_path && (
            <img
              src={`https://image.tmdb.org/t/p/w200${selected.poster_path}`}
              alt=""
              className="w-20 h-28 object-cover rounded-md"
            />
          )}
          <div className="flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-semibold">{selected.title}</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {selected.type === "movie" ? "Filme" : "Série"}
                  {selected.year && ` · ${selected.year}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelected(null)}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {selected.overview && (
              <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{selected.overview}</p>
            )}
            {kind === "adicao" && checkingAvail && (
              <p className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> verificando disponibilidade...
              </p>
            )}
            {blockedByCatalog && (
              <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-200">
                <div className="inline-flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Já está no catálogo
                </div>
                {availability?.category && (
                  <p className="mt-1 opacity-90">Categoria: <strong>{availability.category}</strong></p>
                )}
                <p className="mt-1 opacity-80">
                  Para pedir mesmo assim, mude o tipo do pedido para <em>Atualização</em> ou <em>Conserto</em>.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div>
            <Label htmlFor="tmdb-search">Buscar no catálogo (TMDB)</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="tmdb-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ex: Duna, Breaking Bad..."
                className="pl-9"
                autoFocus
              />
              {isFetching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>

          {search && search.results.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-96 overflow-y-auto pr-1">
              {search.results.map((r) => (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => setSelected(r)}
                  className="group text-left"
                >
                  <div className="aspect-[2/3] rounded-lg overflow-hidden bg-muted relative ring-1 ring-border/40 group-hover:ring-primary/60 transition">
                    {r.poster_path ? (
                      <img
                        src={`https://image.tmdb.org/t/p/w342${r.poster_path}`}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageOff className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <Badge className="absolute top-1.5 right-1.5 bg-black/70 backdrop-blur text-[10px]">
                      {r.type === "movie" ? "Filme" : "Série"}
                    </Badge>
                  </div>
                  <p className="text-xs font-medium truncate mt-1.5">{r.title}</p>
                  <p className="text-[10px] text-muted-foreground">{r.year ?? ""}</p>
                </button>
              ))}
            </div>
          )}


          {search && !search.configured && query.trim().length >= 2 && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-200">
              A busca automática (TMDB) ainda não foi configurada. Você pode digitar o título manualmente abaixo.
            </div>
          )}

          {search && search.configured && search.results.length === 0 && query.trim().length >= 2 && !isFetching && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Nenhum resultado. Você pode enviar manualmente abaixo.
            </p>
          )}

          <div className="pt-2 border-t border-border/40">
            <p className="text-xs text-muted-foreground mb-2">
              Não achou? Envie manualmente:
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Label htmlFor="manual-title">Título</Label>
                <Input
                  id="manual-title"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="Nome do filme ou série"
                  maxLength={200}
                />
              </div>
              <div>
                <Label htmlFor="manual-type">Tipo</Label>
                <select
                  id="manual-type"
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value as "movie" | "tv")}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="movie">Filme</option>
                  <option value="tv">Série</option>
                </select>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-border/40">
        <div>
          <Label htmlFor="kind">Tipo do pedido *</Label>
          <select
            id="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="adicao">Adição</option>
            <option value="atualizacao">Atualização</option>
            <option value="conserto">Conserto</option>
          </select>
        </div>
        <div>
          <Label htmlFor="format">Formato (opcional)</Label>
          <select
            id="format"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— Selecione —</option>
            <option value="HD">HD</option>
            <option value="FHD">FHD</option>
            <option value="4K">4K</option>
            <option value="Dublado">Dublado</option>
            <option value="Legendado">Legendado</option>
            <option value="Dual Áudio">Dual Áudio</option>
          </select>
        </div>
      </div>

      {kind === "adicao" && !availability?.exists && suggestions && suggestions.suggestions.length > 0 && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
          <p className="text-xs font-semibold text-cyan-300 mb-2">
            💡 Já temos algo parecido no catálogo:
          </p>
          <ul className="text-xs text-cyan-100/90 space-y-1">
            {suggestions.suggestions.map((s, i) => (
              <li key={i}>
                • <strong>{s.title}</strong>
                {s.year && ` (${s.year})`}
                {s.category && <span className="opacity-70"> — {s.category}</span>}
                {s.kind === "series" && <span className="opacity-70"> · Série</span>}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground mt-2">
            Se for uma dessas, dá uma olhada primeiro. Não é? Segue enviando normalmente.
          </p>
        </div>
      )}

      <div>
        <Label htmlFor="notes">Observações (opcional)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex: temporada específica, qualidade preferida..."
          maxLength={500}
          rows={3}
        />
      </div>


      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button onClick={() => create.mutate()} disabled={!canSubmit || create.isPending}>
          {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Enviar pedido
        </Button>
      </div>
    </DialogContent>
  );
}
