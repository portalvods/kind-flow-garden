import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Trash2, Plus, Film, Tv, CheckCircle2, AlertCircle, Power } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  listSources,
  createSource,
  deleteSource,
  toggleSource,
  syncSource,
} from "@/lib/catalog.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/catalogo")({
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
  component: CatalogoPage,
});

function CatalogoPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSources);
  const createFn = useServerFn(createSource);
  const deleteFn = useServerFn(deleteSource);
  const toggleFn = useServerFn(toggleSource);
  const syncFn = useServerFn(syncSource);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [interval, setInterval] = useState(12);

  const { data, isLoading } = useQuery({
    queryKey: ["m3u-sources"],
    queryFn: () => listFn(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["m3u-sources"] });

  const create = useMutation({
    mutationFn: () => createFn({ data: { name, url, sync_interval_hours: interval } }),
    onSuccess: () => {
      toast.success("Fonte adicionada. Clique em Sincronizar para indexar.");
      setName("");
      setUrl("");
      setInterval(12);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro"),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Fonte removida");
      invalidate();
    },
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => toggleFn({ data: v }),
    onSuccess: invalidate,
  });

  const sync = useMutation({
    mutationFn: (id: string) => syncFn({ data: { id } }),
    onSuccess: (res) => {
      toast.success(`Sincronizado: ${res.movies} filmes e ${res.series} séries`);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha na sincronização"),
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-3xl font-bold">Catálogo M3U</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Cadastre suas listas M3U. O sistema indexa todos os títulos e bloqueia pedidos de adição
          de conteúdo que já esteja no catálogo.
        </p>
      </div>

      <div className="glass-card rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold">Adicionar nova fonte</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto_auto]">
          <div>
            <Label htmlFor="src-name">Nome</Label>
            <Input id="src-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Servidor principal" />
          </div>
          <div>
            <Label htmlFor="src-url">URL da lista M3U</Label>
            <Input id="src-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://servidor.com/get.php?..." />
          </div>
          <div>
            <Label htmlFor="src-int">Sync (h)</Label>
            <Input
              id="src-int"
              type="number"
              min={1}
              max={168}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value) || 12)}
              className="w-20"
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={() => create.mutate()}
              disabled={!name.trim() || !url.trim() || create.isPending}
              className="w-full"
            >
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (data?.sources ?? []).length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center text-sm text-muted-foreground">
          Nenhuma lista cadastrada ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {data!.sources.map((s) => (
            <div key={s.id} className="glass-card rounded-2xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold truncate">{s.name}</h3>
                    {s.active ? (
                      <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Ativa</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">Inativa</Badge>
                    )}
                    {s.last_status === "ok" && (
                      <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> ok
                      </Badge>
                    )}
                    {s.last_status === "error" && (
                      <Badge variant="outline" className="text-red-400 border-red-500/30">
                        <AlertCircle className="h-3 w-3 mr-1" /> erro
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{s.url}</p>
                  <div className="flex gap-3 flex-wrap text-xs text-muted-foreground mt-2">
                    <span className="inline-flex items-center gap-1"><Film className="h-3 w-3" /> {s.movies_count} filmes</span>
                    <span className="inline-flex items-center gap-1"><Tv className="h-3 w-3" /> {s.series_count} séries</span>
                    <span>sync a cada {s.sync_interval_hours}h</span>
                    <span>
                      última: {s.last_synced_at ? new Date(s.last_synced_at).toLocaleString("pt-BR") : "nunca"}
                    </span>
                  </div>
                  {s.last_error && (
                    <p className="text-xs text-red-400 mt-1 break-all">{s.last_error}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => sync.mutate(s.id)}
                    disabled={sync.isPending}
                  >
                    {sync.isPending && sync.variables === s.id ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1" />
                    )}
                    Sincronizar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggle.mutate({ id: s.id, active: !s.active })}
                    title={s.active ? "Desativar" : "Ativar"}
                  >
                    <Power className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm("Remover esta fonte e todos os itens indexados?")) del.mutate(s.id);
                    }}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="glass-card rounded-2xl p-4 text-xs text-muted-foreground">
        <p><strong>Como funciona:</strong> ao clicar em Sincronizar, o sistema baixa a lista, faz o parse
        de todos os títulos, detecta filmes vs. séries e salva o índice. Quando um cliente for
        pedir uma <em>Adição</em>, o sistema consulta esse índice — se o título já existir, o pedido
        é bloqueado e a categoria é exibida. Pedidos de <em>Atualização</em> e <em>Conserto</em> não são
        bloqueados.</p>
      </div>
    </div>
  );
}
