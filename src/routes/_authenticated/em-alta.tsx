import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Flame, Film, Tv, ImageOff, Star } from "lucide-react";
import { listTrendingWeek } from "@/lib/trending.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/em-alta")({
  component: EmAltaPage,
});

const TABS = [
  { key: "all", label: "Tudo" },
  { key: "movie", label: "Filmes" },
  { key: "tv", label: "Séries" },
] as const;

function EmAltaPage() {
  const [kind, setKind] = useState<"all" | "movie" | "tv">("all");
  const trendingFn = useServerFn(listTrendingWeek);

  const { data, isLoading } = useQuery({
    queryKey: ["trending-week", kind],
    queryFn: () => trendingFn({ data: { kind } }),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Flame className="h-6 w-6 text-primary" />
          Mais assistidos da semana
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ranking mundial atualizado automaticamente toda semana. Não achou no servidor? Faça o pedido.
        </p>
      </div>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={kind === t.key ? "default" : "outline"}
            onClick={() => setKind(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data?.configured === false ? (
        <p className="text-sm text-muted-foreground">TMDB não configurado.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nada encontrado no momento.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {items.map((it, i) => (
            <div
              key={`${it.type}-${it.id}`}
              className="rounded-xl border border-border/50 bg-card/50 overflow-hidden flex flex-col"
            >
              <div className="relative aspect-[2/3] bg-muted/30">
                {it.poster_path ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w342${it.poster_path}`}
                    alt={it.title}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <ImageOff className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <span className="absolute top-2 left-2 rounded-md bg-background/85 px-2 py-0.5 text-xs font-bold">
                  #{i + 1}
                </span>
              </div>
              <div className="p-3 space-y-1.5 flex-1 flex flex-col">
                <p className="text-sm font-medium leading-snug line-clamp-2">{it.title}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-auto pt-1">
                  <Badge variant="secondary" className="gap-1">
                    {it.type === "movie" ? <Film className="h-3 w-3" /> : <Tv className="h-3 w-3" />}
                    {it.type === "movie" ? "Filme" : "Série"}
                  </Badge>
                  {it.year && <span>{it.year}</span>}
                  {it.vote_average > 0 && (
                    <span className="flex items-center gap-0.5 ml-auto">
                      <Star className="h-3 w-3 fill-current text-primary" />
                      {it.vote_average}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
