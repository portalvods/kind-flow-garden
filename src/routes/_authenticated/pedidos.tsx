import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Search, Loader2, Plus, Film, Tv, ImageOff, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { searchTmdb, type TmdbResult } from "@/lib/tmdb.functions";
import { createRequest } from "@/lib/requests.functions";
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
  pending: "Pendente",
  processing: "Em andamento",
  added: "Adicionado",
  rejected: "Recusado",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  processing: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  added: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-400 border-red-500/30",
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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="glow-primary">
              <Plus className="h-4 w-4 mr-2" />
              Novo pedido
            </Button>
          </DialogTrigger>
          <NewRequestDialog onDone={() => setDialogOpen(false)} />
        </Dialog>
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
  poster_path: string | null;
  year: number | null;
  status: string;
  notes: string | null;
  rejection_reason: string | null;
  created_at: string;
};

function RequestCard({ request }: { request: RequestRow }) {
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
          <Badge className={`${STATUS_COLOR[request.status]} border`}>
            {STATUS_LABEL[request.status]}
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
          {request.year ?? "—"} · pedido em {new Date(request.created_at).toLocaleDateString("pt-BR")}
        </p>
        {request.notes && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">📝 {request.notes}</p>
        )}
        {request.rejection_reason && (
          <p className="text-xs text-red-400 mt-2 line-clamp-2">Motivo: {request.rejection_reason}</p>
        )}
      </div>
    </div>
  );
}

function NewRequestDialog({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TmdbResult | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualType, setManualType] = useState<"movie" | "tv">("movie");
  const [notes, setNotes] = useState("");
  const searchFn = useServerFn(searchTmdb);
  const createFn = useServerFn(createRequest);

  const { data: search, isFetching } = useQuery({
    queryKey: ["tmdb", query],
    queryFn: () => searchFn({ data: { query } }),
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
  });

  const create = useMutation({
    mutationFn: async () => {
      const payload = selected
        ? {
            title: selected.title,
            content_type: selected.type,
            tmdb_id: selected.id,
            poster_path: selected.poster_path,
            year: selected.year,
            overview: selected.overview,
            notes: notes || null,
          }
        : {
            title: manualTitle,
            content_type: manualType,
            tmdb_id: null,
            poster_path: null,
            year: null,
            overview: null,
            notes: notes || null,
          };
      return createFn({ data: payload });
    },
    onSuccess: () => {
      toast.success("Pedido enviado! O administrador foi notificado.");
      qc.invalidateQueries({ queryKey: ["my-requests"] });
      onDone();
      setQuery("");
      setSelected(null);
      setManualTitle("");
      setNotes("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao enviar"),
  });

  const canSubmit = selected !== null || manualTitle.trim().length >= 2;

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
            <div className="grid gap-2 max-h-72 overflow-y-auto pr-1">
              {search.results.map((r) => (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => setSelected(r)}
                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent/10 text-left transition"
                >
                  {r.poster_path ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w92${r.poster_path}`}
                      alt=""
                      className="w-10 h-14 object-cover rounded"
                    />
                  ) : (
                    <div className="w-10 h-14 bg-muted rounded flex items-center justify-center">
                      <ImageOff className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.type === "movie" ? "Filme" : "Série"}
                      {r.year && ` · ${r.year}`}
                    </p>
                  </div>
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

      <div>
        <Label htmlFor="notes">Observações (opcional)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex: 4K, dublado, temporada específica..."
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
