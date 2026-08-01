import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, ImageOff, Film, Tv, Star, MessageSquareQuote } from "lucide-react";
import { listTopReviewed, type ReviewedContent } from "@/lib/reviews.functions";
import { ReviewDialog, type ReviewTarget } from "@/components/reviews/ReviewDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/resenhas")({
  head: () => ({
    meta: [
      { title: "Resenhas da comunidade | Portal VOD" },
      {
        name: "description",
        content:
          "Notas e comentários dos clientes sobre os filmes e séries já disponíveis no catálogo.",
      },
      { property: "og:title", content: "Resenhas da comunidade | Portal VOD" },
      {
        property: "og:description",
        content: "Veja o que a comunidade achou dos títulos já adicionados e deixe sua nota.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResenhasPage,
});

function ResenhasPage() {
  const [target, setTarget] = useState<ReviewTarget | null>(null);
  const listFn = useServerFn(listTopReviewed);

  const { data, isLoading } = useQuery({
    queryKey: ["top-reviewed"],
    queryFn: () => listFn({ data: { limit: 60 } }),
  });

  const items: ReviewedContent[] = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <MessageSquareQuote className="h-6 w-6 text-primary" />
          Resenhas da comunidade
        </h1>
        <p className="text-sm text-muted-foreground">
          Notas e comentários dos clientes sobre os conteúdos já disponíveis.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border/60 p-10 text-center text-muted-foreground">
          Nenhuma resenha ainda. Abra a aba <strong>Novidades</strong> e avalie um conteúdo já adicionado.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((it) => (
            <div key={it.content_key} className="group">
              <div className="aspect-[2/3] overflow-hidden rounded-lg bg-muted ring-1 ring-border/40">
                {it.poster_path ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w342${it.poster_path}`}
                    alt={`Pôster de ${it.title}`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageOff className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </div>
              <p className="mt-2 truncate text-sm font-medium">{it.title}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  {it.content_type === "tv" ? <Tv className="h-3 w-3" /> : <Film className="h-3 w-3" />}
                  {it.content_type === "tv" ? "Série" : "Filme"}
                </Badge>
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  {it.avg_rating} ({it.total})
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 w-full"
                onClick={() =>
                  setTarget({
                    content_key: it.content_key,
                    title: it.title,
                    year: it.year,
                    content_type: it.content_type === "tv" ? "tv" : "movie",
                    poster_path: it.poster_path,
                    my_rating: it.my_rating,
                  })
                }
              >
                Ver resenhas
              </Button>
            </div>
          ))}
        </div>
      )}

      <ReviewDialog
        target={target}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      />
    </div>
  );
}
