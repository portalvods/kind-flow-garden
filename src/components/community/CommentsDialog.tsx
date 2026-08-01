import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Send, Trash2 } from "lucide-react";
import {
  addRequestComment,
  deleteRequestComment,
  listRequestComments,
  type RequestComment,
} from "@/lib/community.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  requestId: string | null;
  title: string;
  onOpenChange: (open: boolean) => void;
};

export function CommentsDialog({ requestId, title, onOpenChange }: Props) {
  const [body, setBody] = useState("");
  const listFn = useServerFn(listRequestComments);
  const addFn = useServerFn(addRequestComment);
  const delFn = useServerFn(deleteRequestComment);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["request-comments", requestId],
    queryFn: () => listFn({ data: { request_id: requestId! } }),
    enabled: !!requestId,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["request-comments", requestId] });
    qc.invalidateQueries({ queryKey: ["community-requests"] });
  };

  const add = useMutation({
    mutationFn: () => addFn({ data: { request_id: requestId!, body: body.trim() } }),
    onSuccess: () => {
      setBody("");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao comentar"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao excluir"),
  });

  const items: RequestComment[] = data?.items ?? [];

  return (
    <Dialog open={!!requestId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="line-clamp-2">Comentários — {title}</DialogTitle>
          <DialogDescription>Comente sobre este pedido. Os nomes aparecem só com as iniciais.</DialogDescription>
        </DialogHeader>

        <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum comentário ainda. Seja o primeiro!
            </p>
          ) : (
            items.map((c) => (
              <div key={c.id} className="rounded-lg border border-border/60 bg-card/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-primary">{c.author_initials}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(c.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                    {c.mine ? (
                      <button
                        type="button"
                        aria-label="Excluir comentário"
                        className="text-muted-foreground transition-colors hover:text-destructive"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(c.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.body}</p>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 500))}
            placeholder="Escreva um comentário..."
            rows={3}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{body.trim().length}/500</span>
            <Button
              size="sm"
              className="gap-1"
              disabled={body.trim().length < 2 || add.isPending}
              onClick={() => add.mutate()}
            >
              {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Comentar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
