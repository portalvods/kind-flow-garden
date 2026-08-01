import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Star } from "lucide-react";
import {
  listContentReviews,
  upsertContentReview,
  type ContentReview,
} from "@/lib/reviews.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ReviewTarget = {
  content_key: string;
  title: string;
  year?: number | null;
  content_type: "movie" | "tv";
  tmdb_id?: number | null;
  poster_path?: string | null;
  my_rating?: number | null;
};

export function contentKeyFor(input: {
  content_type: string;
  tmdb_id?: number | null;
  title: string;
  year?: number | null;
}) {
  if (input.tmdb_id) return `${input.content_type}:${input.tmdb_id}`;
  const slug = input.title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${input.content_type}:${slug}:${input.year ?? ""}`;
}

function Stars({
  value,
  onChange,
  size = "h-6 w-6",
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: string;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
          onClick={() => onChange?.(n)}
          className={onChange ? "transition-transform hover:scale-110" : "cursor-default"}
        >
          <Star
            className={`${size} ${n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
          />
        </button>
      ))}
    </div>
  );
}

export function ReviewStars({ value, size }: { value: number; size?: string }) {
  return <Stars value={value} size={size ?? "h-3.5 w-3.5"} />;
}

export function ReviewDialog({
  target,
  onOpenChange,
}: {
  target: ReviewTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const qc = useQueryClient();
  const listFn = useServerFn(listContentReviews);
  const saveFn = useServerFn(upsertContentReview);

  useEffect(() => {
    setRating(target?.my_rating ?? 0);
    setBody("");
  }, [target?.content_key, target?.my_rating]);

  const { data, isLoading } = useQuery({
    queryKey: ["content-reviews", target?.content_key],
    queryFn: () => listFn({ data: { content_key: target!.content_key } }),
    enabled: !!target,
  });

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          content_key: target!.content_key,
          title: target!.title,
          year: target!.year ?? null,
          content_type: target!.content_type,
          tmdb_id: target!.tmdb_id ?? null,
          poster_path: target!.poster_path ?? null,
          rating,
          body: body.trim() ? body.trim() : null,
        },
      }),
    onSuccess: () => {
      toast.success("Resenha publicada!");
      setBody("");
      qc.invalidateQueries({ queryKey: ["content-reviews", target?.content_key] });
      qc.invalidateQueries({ queryKey: ["review-stats"] });
      qc.invalidateQueries({ queryKey: ["top-reviewed"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
  });

  const items: ContentReview[] = data?.items ?? [];

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="line-clamp-2">Resenhas — {target?.title}</DialogTitle>
          <DialogDescription>
            Dê sua nota e conte o que achou. Sua resenha fica visível para a comunidade (só as iniciais do nome).
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border/60 bg-card/60 p-3 space-y-2">
          <Stars value={rating} onChange={setRating} />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 500))}
            placeholder="Comentário (opcional)"
            rows={3}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{body.trim().length}/500</span>
            <Button size="sm" disabled={rating < 1 || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Publicar resenha
            </Button>
          </div>
        </div>

        <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Ainda não há resenhas. Seja o primeiro!
            </p>
          ) : (
            items.map((r) => (
              <div key={r.id} className="rounded-lg border border-border/60 bg-card/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-primary">
                    {r.author_initials}
                    {r.mine ? " (você)" : ""}
                  </span>
                  <ReviewStars value={r.rating} />
                </div>
                {r.body ? (
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm">{r.body}</p>
                ) : null}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
