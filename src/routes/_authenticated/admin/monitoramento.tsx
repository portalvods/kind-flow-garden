import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, ShieldCheck, Globe, Users, Clock, History } from "lucide-react";
import { getSystemStatus, getActiveSessions, getOnlineUsersCount } from "@/lib/monitoring.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/admin/monitoramento")({
  component: MonitoringPage,
});

function MonitoringPage() {
  const systemStatusFn = useServerFn(getSystemStatus);
  const onlineCountFn = useServerFn(getOnlineUsersCount);
  const activeSessionsFn = useServerFn(getActiveSessions);

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["system-status"],
    queryFn: () => systemStatusFn(),
    refetchInterval: 30000,
  });

  const { data: onlineCount } = useQuery({
    queryKey: ["online-users"],
    queryFn: () => onlineCountFn(),
    refetchInterval: 10000,
  });

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ["active-sessions"],
    queryFn: () => activeSessionsFn(),
    refetchInterval: 15000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Monitoramento do Sistema</h1>
        <p className="text-muted-foreground">Status em tempo real das conexões e usuários ativos.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="glass-card overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Evolution API</CardTitle>
            <Activity className={`h-4 w-4 ${status?.evolution ? "text-green-500" : "text-red-500 animate-pulse"}`} />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{statusLoading ? "..." : (status?.evolution ? "Online" : "Offline")}</div>
              <Badge variant={status?.evolution ? "secondary" : "destructive"}>
                {status?.evolution ? "Conectado" : "Erro"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">TMDB API</CardTitle>
            <Globe className={`h-4 w-4 ${status?.tmdb ? "text-green-500" : "text-red-500 animate-pulse"}`} />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{statusLoading ? "..." : (status?.tmdb ? "Online" : "Offline")}</div>
              <Badge variant={status?.tmdb ? "secondary" : "destructive"}>
                {status?.tmdb ? "Estável" : "Erro"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usuários Online</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{onlineCount ?? 0}</div>
              <p className="text-xs text-muted-foreground">Ativos nos últimos 5 min</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Sessões Ativas & Histórico Recente
          </CardTitle>
          <CardDescription>Lista dos últimos usuários que interagiram com o portal.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase border-b border-border/40">
                <tr>
                  <th className="px-4 py-3">Usuário</th>
                  <th className="px-4 py-3">WhatsApp</th>
                  <th className="px-4 py-3">Última Atividade</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {sessionsLoading ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Carregando sessões...</td></tr>
                ) : sessions?.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nenhuma sessão registrada.</td></tr>
                ) : sessions?.map((session: any) => {
                  const isOnline = new Date(session.last_active_at).getTime() > Date.now() - 5 * 60 * 1000;
                  return (
                    <tr key={session.id} className="hover:bg-accent/5 transition-colors">
                      <td className="px-4 py-3 font-medium">{session.profiles?.full_name || "Desconhecido"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{session.profiles?.whatsapp || "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(session.last_active_at), { addSuffix: true, locale: ptBR })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isOnline ? (
                          <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/20">Online</Badge>
                        ) : (
                          <Badge variant="outline">Offline</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
