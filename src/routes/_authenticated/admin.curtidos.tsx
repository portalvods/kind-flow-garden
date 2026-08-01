import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ThumbsUp, Film, Tv, ImageOff, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listMostVotedRequests } from "@/lib/admin-extras.functions";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/curtidos")({
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
  component: MaisCurtidosPage,
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
  completed: "Concluído",
  added: "Adicionado",
  fixed: "Corrigido",
  rejected: "Recusado",
};

function MaisCurtidosPage() {
  const fetchFn = useServerFn(listMostVotedRequests);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-most-voted"],
    queryFn: () => fetchFn(),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <ThumbsUp className="h-7 w-7 text-primary" /> Mais curtidos
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Pedidos ordenados pelas curtidas da comunidade — priorize os do topo.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center text-muted-foreground">
          Ainda ninguém curtiu nenhum pedido.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => (
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
                  <span className="text-muted-foreground mr-1">#{i + 1}</span>
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
                <p className="mt-1 text-xs text-muted-foreground truncate">
                  por {it.author_name ?? "—"}
                </p>

                <div className="mt-auto pt-2 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                    <ThumbsUp className="h-4 w-4" /> {it.votes}
                  </span>
                  {it.author_whatsapp ? (
                    <a
                      href={`https://wa.me/${it.author_whatsapp}`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <MessageCircle className="h-3 w-3" /> WhatsApp
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
