import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Notif = { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

export function NotificationBell({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [composing, setComposing] = useState(false);
  const { data } = useQuery({
    queryKey: ["notifications", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, title, body, link, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      return (data ?? []) as Notif[];
    },
    refetchInterval: 30000,
  });
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin-bell", userId],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
      return !!data;
    },
  });
  const items = data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  async function markAll() {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    qc.invalidateQueries({ queryKey: ["notifications", userId] });
  }

  return (
    <Popover onOpenChange={(o) => { if (!o) { setComposing(false); if (unread) markAll(); } }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative" aria-label="Notificações">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
          <span className="font-semibold text-sm">Notificações</span>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <button onClick={() => setComposing((c) => !c)} className="text-xs text-primary inline-flex items-center gap-1">
                <Send className="h-3 w-3" /> {composing ? "Voltar" : "Enviar"}
              </button>
            )}
            {!composing && unread > 0 && (
              <button onClick={markAll} className="text-xs text-primary inline-flex items-center gap-1">
                <CheckCheck className="h-3 w-3" /> Lidas
              </button>
            )}
          </div>
        </div>
        {composing ? (
          <Compose onDone={() => { setComposing(false); qc.invalidateQueries({ queryKey: ["notifications", userId] }); }} />
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma notificação ainda.</p>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  to={(n.link ?? "/pedidos") as "/pedidos"}
                  className={`block px-3 py-2.5 border-b border-border/20 hover:bg-accent/10 ${n.read_at ? "" : "bg-primary/5"}`}
                >
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">{n.body}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString("pt-BR")}</p>
                </Link>
              ))
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Compose({ onDone }: { onDone: () => void }) {
  const [wa, setWa] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!title.trim()) return toast.error("Informe o título.");
    if (!wa.trim() && !confirm("Enviar para TODOS os usuários?")) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_send_notification", { _whatsapp: wa, _title: title, _body: body, _link: "" });
    setBusy(false);
    const res = data as { ok: boolean; error?: string; sent?: number } | null;
    if (error || !res?.ok) return toast.error(error?.message ?? res?.error ?? "Erro");
    toast.success(`Enviado para ${res.sent} usuário(s).`);
    onDone();
  }

  return (
    <div className="p-3 space-y-2">
      <Input placeholder="WhatsApp (vazio = todos)" value={wa} onChange={(e) => setWa(e.target.value)} />
      <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea placeholder="Mensagem" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
      <Button className="w-full" size="sm" onClick={send} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-2" />} Enviar notificação
      </Button>
    </div>
  );
}
