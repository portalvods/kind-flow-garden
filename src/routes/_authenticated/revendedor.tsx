import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus, Users, X, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/revendedor")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Painel do revendedor — Portal VOD" },
      { name: "description", content: "Acompanhe os clientes e pedidos da sua revenda." },
      { property: "og:title", content: "Painel do revendedor — Portal VOD" },
      { property: "og:description", content: "Acompanhe os clientes e pedidos da sua revenda." },
    ],
  }),
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).in("role", ["revendedor", "admin"]);
    if (!data?.length) throw redirect({ to: "/pedidos" });
  },
  component: ResellerPage,
});

type Client = { id: string; full_name: string | null; whatsapp: string; created_at: string; total: number; pending: number; completed: number; today: number; last_request: string | null };

const STATUS: Record<string, string> = {
  pending: "Recebido", analyzing: "Em análise", processing: "Em andamento", approved: "Aprovado",
  added: "Adicionado", completed: "Concluído", fixed: "Consertado", rejected: "Recusado",
};

function ResellerPage() {
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const { data: clients, isLoading } = useQuery({
    queryKey: ["reseller-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reseller_list_clients");
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });

  async function link() {
    if (!phone.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("reseller_link_client", { _whatsapp: phone });
    setBusy(false);
    const res = data as { ok: boolean; error?: string } | null;
    if (error || !res?.ok) return toast.error(error?.message ?? res?.error ?? "Erro");
    toast.success("Cliente adicionado.");
    setPhone("");
    qc.invalidateQueries({ queryKey: ["reseller-clients"] });
  }

  async function unlink(id: string) {
    if (!confirm("Remover este cliente da sua lista?")) return;
    await supabase.rpc("reseller_unlink_client", { _client: id });
    qc.invalidateQueries({ queryKey: ["reseller-clients"] });
  }

  const list = clients ?? [];
  const totals = list.reduce((a, c) => ({ total: a.total + Number(c.total), pending: a.pending + Number(c.pending), today: a.today + Number(c.today) }), { total: 0, pending: 0, today: 0 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Painel do revendedor</h1>
        <p className="text-muted-foreground text-sm mt-1">Seus clientes e os pedidos deles.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[["Clientes", list.length], ["Pedidos", totals.total], ["Em aberto", totals.pending], ["Hoje", totals.today]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border border-border/50 bg-card/50 p-4">
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className="text-2xl font-bold">{v}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border/50 bg-card/50 p-4 flex flex-col sm:flex-row gap-2">
        <Input placeholder="WhatsApp do cliente cadastrado" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Button onClick={link} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />} Adicionar cliente
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : list.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2" /> Nenhum cliente vinculado ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((c) => (
            <div key={c.id} className="rounded-xl border border-border/50 bg-card/50">
              <div className="p-4 flex flex-wrap items-center gap-3 justify-between">
                <div>
                  <p className="font-medium">{c.full_name ?? "Sem nome"}</p>
                  <p className="text-xs text-muted-foreground">{c.whatsapp}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{c.total} pedidos</Badge>
                  <Badge variant="outline">{c.pending} em aberto</Badge>
                  <Badge variant="outline">{c.completed} concluídos</Badge>
                  <Button size="sm" variant="ghost" onClick={() => setOpen(open === c.id ? null : c.id)}>
                    {open === c.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => unlink(c.id)} title="Remover"><X className="h-4 w-4" /></Button>
                </div>
              </div>
              {open === c.id && <ClientRequests clientId={c.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ClientRequests({ clientId }: { clientId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["reseller-client-req", clientId],
    queryFn: async () => {
      const { data } = await supabase.rpc("reseller_client_requests", { _client: clientId });
      return data ?? [];
    },
  });
  if (isLoading) return <div className="p-4"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  if (!data?.length) return <p className="px-4 pb-4 text-sm text-muted-foreground">Sem pedidos.</p>;
  return (
    <ul className="border-t border-border/30 divide-y divide-border/20">
      {data.map((r) => (
        <li key={r.id} className="px-4 py-2 flex items-center justify-between gap-2 text-sm">
          <span className="truncate">{r.title}</span>
          <span className="flex items-center gap-2 shrink-0">
            <Badge variant="outline">{STATUS[r.status] ?? r.status}</Badge>
            <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
