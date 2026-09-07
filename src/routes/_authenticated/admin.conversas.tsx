import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, MessageCircle, Search, Send, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listConversations, listWaMessages, replyConversation } from "@/lib/wa-chat.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/admin/conversas")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!data) throw redirect({ to: "/pedidos" });
  },
  component: ConversasPage,
});

function formatPhone(n: string) {
  const d = n.replace(/\D/g, "");
  const local = d.startsWith("55") ? d.slice(2) : d;
  if (local.length >= 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, local.length - 4)}-${local.slice(-4)}`;
  }
  return n;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function ConversasPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listConversations);
  const msgsFn = useServerFn(listWaMessages);
  const replyFn = useServerFn(replyConversation);

  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["wa-conversations"],
    queryFn: () => listFn(),
    refetchInterval: 20000,
  });

  const { data: thread, isLoading: loadingThread } = useQuery({
    queryKey: ["wa-thread", selected],
    queryFn: () => msgsFn({ data: { whatsapp: selected! } }),
    enabled: !!selected,
    refetchInterval: 15000,
  });

  const send = useMutation({
    mutationFn: () => replyFn({ data: { whatsapp: selected!, message: text.trim() } }),
    onSuccess: () => {
      setText("");
      toast.success("Mensagem enviada.");
      qc.invalidateQueries({ queryKey: ["wa-thread", selected] });
      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const conversations = useMemo(() => {
    const all = data?.conversations ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (c) => (c.name ?? "").toLowerCase().includes(q) || c.whatsapp.includes(q.replace(/\D/g, "")),
    );
  }, [data, search]);

  const current = conversations.find((c) => c.whatsapp === selected) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-primary" />
            Conversas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Todas as mensagens trocadas com os clientes pelo WhatsApp.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            qc.invalidateQueries({ queryKey: ["wa-conversations"] });
            qc.invalidateQueries({ queryKey: ["wa-thread", selected] });
          }}
        >
          <RefreshCw className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Atualizar</span>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Lista */}
        <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
          <div className="p-3 border-b border-border/40">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar nome ou número"
                className="pl-8"
              />
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-border/40">
            {isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhuma conversa ainda.</p>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.whatsapp}
                  onClick={() => setSelected(c.whatsapp)}
                  className={`w-full text-left px-3 py-3 transition-colors ${
                    selected === c.whatsapp ? "bg-primary/10" : "hover:bg-accent/10"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{c.name ?? formatPhone(c.whatsapp)}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{formatTime(c.last_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {c.last_direction === "out" ? "Você: " : ""}
                    {c.last_body}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Thread */}
        <div className="rounded-xl border border-border/50 bg-card/50 flex flex-col min-h-[50vh]">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center p-8 text-sm text-muted-foreground">
              Escolha uma conversa para ver as mensagens.
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border/40">
                <p className="text-sm font-semibold">{current?.name ?? formatPhone(selected)}</p>
                <p className="text-xs text-muted-foreground">{formatPhone(selected)}</p>
              </div>
              <div className="flex-1 max-h-[50vh] overflow-y-auto p-4 space-y-3">
                {loadingThread ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  (thread?.messages ?? []).map((m) => (
                    <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                          m.direction === "out"
                            ? "bg-primary/15 text-foreground rounded-br-sm"
                            : "bg-muted/40 text-foreground rounded-bl-sm"
                        }`}
                      >
                        {m.body}
                        <span className="block text-[10px] text-muted-foreground mt-1">{formatTime(m.created_at)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="p-3 border-t border-border/40 flex gap-2">
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Escreva uma resposta..."
                  rows={2}
                  className="resize-none"
                />
                <Button
                  onClick={() => send.mutate()}
                  disabled={!text.trim() || send.isPending}
                  className="self-end"
                >
                  {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
