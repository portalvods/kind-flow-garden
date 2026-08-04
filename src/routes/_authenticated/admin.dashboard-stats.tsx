import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, TrendingUp, Users, ShoppingBag, Calendar, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin/dashboard-stats")({
  ssr: false,
  component: DashboardStatsPage,
});

function DashboardStatsPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-dashboard-stats"],
    queryFn: async () => {
      // Pedidos totais e por status
      const { data: requests } = await supabase.from("requests").select("status, created_at");
      const totalRequests = requests?.length ?? 0;
      const completedRequests = requests?.filter(r => r.status === 'concluido').length ?? 0;
      const pendingRequests = requests?.filter(r => r.status === 'pendente').length ?? 0;

      // Usuários totais
      const { count: userCount } = await supabase.from("profiles").select("*", { count: 'exact', head: true });

      // Pedidos nos últimos 7 dias
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      const recentRequests = requests?.filter(r => new Date(r.created_at) > lastWeek).length ?? 0;

      return {
        totalRequests,
        completedRequests,
        pendingRequests,
        userCount: userCount ?? 0,
        recentRequests
      };
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold">Estatísticas do Sistema</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold">Estatísticas do Sistema</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Total de Pedidos" 
          value={stats?.totalRequests ?? 0} 
          icon={<ShoppingBag className="h-5 w-5" />} 
          description="Desde o início"
        />
        <StatCard 
          title="Usuários" 
          value={stats?.userCount ?? 0} 
          icon={<Users className="h-5 w-5" />} 
          description="Contas ativas"
        />
        <StatCard 
          title="Concluídos" 
          value={stats?.completedRequests ?? 0} 
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />} 
          description="Conteúdos adicionados"
        />
        <StatCard 
          title="Últimos 7 dias" 
          value={stats?.recentRequests ?? 0} 
          icon={<Calendar className="h-5 w-5 text-primary" />} 
          description="Novas solicitações"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="glass-card border-none">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Distribuição de Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <StatusProgress label="Pendente" value={stats?.pendingRequests ?? 0} total={stats?.totalRequests ?? 1} color="bg-amber-500" />
              <StatusProgress label="Concluído" value={stats?.completedRequests ?? 0} total={stats?.totalRequests ?? 1} color="bg-emerald-500" />
              <StatusProgress label="Outros" value={(stats?.totalRequests ?? 0) - (stats?.pendingRequests ?? 0) - (stats?.completedRequests ?? 0)} total={stats?.totalRequests ?? 1} color="bg-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-none">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Taxa de Conversão
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-6">
            <div className="text-4xl font-bold text-primary mb-2">
              {Math.round(((stats?.completedRequests ?? 0) / (stats?.totalRequests ?? 1)) * 100)}%
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Dos pedidos feitos foram entregues com sucesso aos clientes.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, description }: { title: string; value: number; icon: React.ReactNode; description: string }) {
  return (
    <Card className="glass-card border-none">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

function StatusProgress({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const percentage = Math.round((value / total) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">{value} ({percentage}%)</span>
      </div>
      <div className="h-2 w-full bg-accent/20 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
