import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ImageOff, Film, Tv, ThumbsUp, Users2, MessageSquare, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CommentsDialog } from "@/components/community/CommentsDialog";
import { listCommunityRequests, toggleRequestVote, type CommunityRequest } from "@/lib/community.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/comunidade")({
  head: () => ({
    meta: [
      { title: "Pedidos da comunidade | Portal VOD" },
      {
        name: "description",
        content:
          "Veja os pedidos feitos por outros clientes e curta os títulos que você também quer que sejam adicionados ou arrumados.",
      },
      { property: "og:title", content: "Pedidos da comunidade | Portal VOD" },
      {
        property: "og:description",
        content: "Curta os pedidos de filmes e séries que você quer ver no ar primeiro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ComunidadePage,
});

const KIND_LABEL: Record<string, string> = {
  adicao: "Adição",
  atualizacao: "Atualização",
  conserto: "Conserto",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  analyzing: "Em análise",
  approved: "Aprovado",
  processing: "Processando",
};

function ComunidadePage() {
  const [sort, setSort] = useState<"votes" | "recent">("votes");
  const [search, setSearch] = useState("");
  const [openComments, setOpenComments] = useState<{ id: string; title: string } | null>(null);
  const listFn = useServerFn(listCommunityRequests);
  const voteFn = useServerFn(toggleRequestVote);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["community-requests"],
    queryFn: () => listFn({ data: { limit: 100 } }),
  });

  const vote = useMutation({
    mutationFn: (request_id: string) => voteFn({ data: { request_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-requests"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao curtir"),
  });

  const q = search.trim().toLowerCase();
  const items: CommunityRequest[] = [...(data?.items ?? [])]
    .filter((it) => (q ? it.title.toLowerCase().includes(q) : true))
    .sort((a, b) =>
      sort === "votes"
        ? b.votes - a.votes || +new Date(b.created_at) - +new Date(a.created_at)
        : +new Date(b.created_at) - +new Date(a.created_at),
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Users2 className="h-6 w-6 text-primary" />
            Pedidos da comunidade
          </h1>
          <p className="text-sm text-muted-foreground">
            Aqui aparecem as adições e atualizações mais aguardadas pela comunidade. Curta o que você também quer que entre logo.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={sort === "votes" ? "default" : "outline"} onClick={() => setSort("votes")}>
            Mais curtidos
          </Button>
          <Button size="sm" variant={sort === "recent" ? "default" : "outline"} onClick={() => setSort("recent")}>
            Recentes
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar título..."
          className="pl-9"
        />
      </div>



      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border/60 p-10 text-center text-muted-foreground">
          Nenhum título em alta ainda.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <div
              key={it.request_id}
              className="rounded-xl border border-border/60 bg-card/60 overflow-hidden flex gap-3 p-3"
            >
              <div className="h-28 w-20 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                {it.poster_path ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w185${it.poster_path}`}
                    alt={`Pôster de ${it.title}`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageOff className="h-5 w-5 text-muted-foreground" />
                )}
              </div>

              <div className="min-w-0 flex-1 flex flex-col">
                <p className="font-medium leading-tight line-clamp-2">
                  {it.title}
                  {it.year ? <span className="text-muted-foreground"> ({it.year})</span> : null}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <Badge variant="secondary" className="gap-1">
                    {it.content_type === "tv" ? <Tv className="h-3 w-3" /> : <Film className="h-3 w-3" />}
                    {it.content_type === "tv" ? "Série" : "Filme"}
                  </Badge>
                  <Badge variant="outline">{KIND_LABEL[it.request_kind] ?? it.request_kind}</Badge>
                  <Badge variant="outline">{STATUS_LABEL[it.status] ?? it.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">por {it.author_initials}</p>

                <div className="mt-auto flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant={it.voted ? "default" : "outline"}
                    className="gap-1"
                    disabled={vote.isPending}
                    onClick={() => vote.mutate(it.request_id)}
                  >
                    <ThumbsUp className="h-4 w-4" />
                    {it.votes}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => setOpenComments({ id: it.request_id, title: it.title })}
                  >
                    <MessageSquare className="h-4 w-4" />
                    {it.comments}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CommentsDialog
        requestId={openComments?.id ?? null}
        title={openComments?.title ?? ""}
        onOpenChange={(open) => {
          if (!open) setOpenComments(null);
        }}
      />
    </div>
  );
}
