import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Wrench, Copy, Loader2, Download, Files } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listDuplicateRequests, exportData } from "@/lib/tools.functions";

export const Route = createFileRoute("/_authenticated/admin/ferramentas")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!data) throw redirect({ to: "/pedidos" });
  },
  component: ToolsPage,
});

function ToolsPage() {
  const dupsFn = useServerFn(listDuplicateRequests);
  const exportFn = useServerFn(exportData);

  const { data: dups, isLoading } = useQuery({
    queryKey: ["admin-duplicates"],
    queryFn: () => dupsFn(),
  });

  const doExport = useMutation({
    mutationFn: () => exportFn(),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup baixado.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro"),
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <Wrench className="h-7 w-7 text-primary" />
          Ferramentas
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Detecção de pedidos duplicados e backup completo dos dados.
        </p>
      </div>

      {/* Backup */}
      <div className="glass-card rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 font-semibold">
          <Download className="h-4 w-4 text-primary" />
          Backup dos dados
        </div>
        <p className="text-xs text-muted-foreground">
          Baixa um arquivo JSON com pedidos, usuários, configurações e templates.
          Recomendado semanalmente.
        </p>
        <Button onClick={() => doExport.mutate()} disabled={doExport.isPending}>
          {doExport.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          <Download className="h-4 w-4 mr-2" />
          Baixar backup (.json)
        </Button>
      </div>

      {/* Duplicates */}
      <div className="glass-card rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 font-semibold">
          <Files className="h-4 w-4 text-primary" />
          Pedidos duplicados (em aberto)
        </div>
        <p className="text-xs text-muted-foreground">
          Pedidos abertos agrupados por título normalizado. Útil pra identificar quando várias
          pessoas pedem a mesma coisa.
        </p>

        {isLoading && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        )}

        {!isLoading && (!dups || dups.length === 0) && (
          <p className="text-xs text-muted-foreground">Nenhum duplicado no momento. 🎉</p>
        )}

        {dups && dups.length > 0 && (
          <div className="space-y-2">
            {dups.map((g) => (
              <div key={g.normalized_title} className="rounded-lg border border-border/40 p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{g.sample_title}</span>
                  {g.year && <span className="text-xs text-muted-foreground">({g.year})</span>}
                  <Badge variant="secondary" className="text-[10px]">
                    {g.content_type === "movie" ? "Filme" : "Série"}
                  </Badge>
                  <Badge className="bg-primary/15 text-primary border-primary/30 border text-[10px]">
                    {g.count} pedidos
                  </Badge>
                  <button
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    onClick={() => {
                      navigator.clipboard.writeText(g.request_ids.join(","));
                      toast.success("IDs copiados");
                    }}
                  >
                    <Copy className="h-3 w-3" /> copiar IDs
                  </button>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {g.user_ids.length} usuário(s) distinto(s)
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
