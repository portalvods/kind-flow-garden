import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Trophy, Crown, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listTopClients } from "@/lib/admin-extras.functions";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/ranking")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!data) throw redirect({ to: "/pedidos" });
  },
  component: RankingPage,
});

function RankingPage() {
  const fetchFn = useServerFn(listTopClients);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-top-clients"],
    queryFn: () => fetchFn(),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <Trophy className="h-7 w-7 text-primary" /> Ranking de clientes
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Top clientes por volume de pedidos. Só você vê.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data?.clients?.length ? (
        <div className="glass-card rounded-2xl p-12 text-center text-muted-foreground">
          Ainda não há pedidos suficientes para gerar o ranking.
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Concluídos</th>
                <th className="px-4 py-3 text-right">Pendentes</th>
                <th className="px-4 py-3 text-right">Recusados</th>
                <th className="px-4 py-3 text-right">Último pedido</th>
                <th className="px-4 py-3 text-right">WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {data.clients.map((c, i) => (
                <tr key={c.user_id} className="border-t border-border/40 hover:bg-accent/5">
                  <td className="px-4 py-3">
                    {i === 0 ? (
                      <Crown className="h-4 w-4 text-yellow-400" />
                    ) : (
                      <span className="text-muted-foreground">{i + 1}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">{c.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold">{c.total}</td>
                  <td className="px-4 py-3 text-right">
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
                      {c.completed}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge variant="outline" className="border-yellow-500/40 text-yellow-300">
                      {c.pending}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge variant="outline" className="border-red-500/40 text-red-300">
                      {c.rejected}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                    {c.last_request ? new Date(c.last_request).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.whatsapp ? (
                      <a
                        href={`https://wa.me/${c.whatsapp}`}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                      >
                        <MessageCircle className="h-3 w-3" /> {c.whatsapp}
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
