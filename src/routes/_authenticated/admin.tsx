import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Film,
  Tv,
  ImageOff,
  Search,
  Check,
  X,
  Clock,
  Play,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { updateRequestStatus } from "@/lib/requests.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin")({
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
  component: AdminPage,
});

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  processing: "Em andamento",
  added: "Adicionado",
  rejected: "Recusado",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  processing: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  added: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-400 border-red-500/30",
};

type AdminRequest = {
  id: string;
  user_id: string;
  title: string;
  content_type: "movie" | "tv";
  poster_path: string | null;
  year: number | null;
  status: "pending" | "processing" | "added" | "rejected";
  notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  profiles?: { full_name: string | null; whatsapp: string | null } | null;
};

function AdminPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "processing" | "added" | "rejected" | "all">("pending");
  const [search, setSearch] = useState("");
  const [rejectTarget, setRejectTarget] = useState<AdminRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const updateFn = useServerFn(updateRequestStatus);

  const { data: requests, isLoading } = useQuery({
    queryKey: ["admin-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requests")
        .select("*, profiles(full_name, whatsapp)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as AdminRequest[];
    },
  });

  const stats = {
    pending: requests?.filter((r) => r.status === "pending").length ?? 0,
    processing: requests?.filter((r) => r.status === "processing").length ?? 0,
    added: requests?.filter((r) => r.status === "added").length ?? 0,
    rejected: requests?.filter((r) => r.status === "rejected").length ?? 0,
  };

  const filtered = (requests ?? [])
    .filter((r) => tab === "all" || r.status === tab)
    .filter(
      (r) =>
        !search ||
        r.title.toLowerCase().includes(search.toLowerCase()) ||
        r.profiles?.full_name?.toLowerCase().includes(search.toLowerCase()),
    );

  const changeStatus = useMutation({
    mutationFn: async (input: {
      id: string;
      status: "pending" | "processing" | "added" | "rejected";
      rejection_reason?: string | null;
    }) => updateFn({ data: input }),
    onSuccess: (_, vars) => {
      toast.success(
        vars.status === "added"
          ? "Marcado como adicionado. Cliente foi notificado."
          : "Status atualizado.",
      );
      qc.invalidateQueries({ queryKey: ["admin-requests"] });
      setRejectTarget(null);
      setRejectReason("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao atualizar"),
  });

  const deleteRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido excluído");
      qc.invalidateQueries({ queryKey: ["admin-requests"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao excluir"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Painel administrativo</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie todos os pedidos do portal.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <StatCard label="Pendentes" value={stats.pending} tone="yellow" icon={<Clock className="h-4 w-4" />} />
        <StatCard label="Em andamento" value={stats.processing} tone="blue" icon={<Play className="h-4 w-4" />} />
        <StatCard label="Adicionados" value={stats.added} tone="emerald" icon={<Check className="h-4 w-4" />} />
        <StatCard label="Recusados" value={stats.rejected} tone="red" icon={<X className="h-4 w-4" />} />
      </div>

      {/* Search + Tabs */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="bg-card/60 border border-border/60">
            <TabsTrigger value="pending">Pendentes</TabsTrigger>
            <TabsTrigger value="processing">Em andamento</TabsTrigger>
            <TabsTrigger value="added">Adicionados</TabsTrigger>
            <TabsTrigger value="rejected">Recusados</TabsTrigger>
            <TabsTrigger value="all">Todos</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="hidden" />
        </Tabs>
        <div className="relative flex-1 max-w-xs min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar título ou cliente..."
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center text-muted-foreground">
          Nenhum pedido nesta categoria.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className="glass-card rounded-2xl p-4 flex flex-wrap gap-4">
              <div className="w-16 h-24 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                {r.poster_path ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w200${r.poster_path}`}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageOff className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-[200px]">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h3 className="font-semibold">{r.title}</h3>
                  <Badge variant="secondary" className="text-xs">
                    {r.content_type === "movie" ? (
                      <><Film className="h-3 w-3 mr-1" /> Filme</>
                    ) : (
                      <><Tv className="h-3 w-3 mr-1" /> Série</>
                    )}
                  </Badge>
                  {r.year && <span className="text-xs text-muted-foreground">{r.year}</span>}
                  <Badge className={`${STATUS_COLOR[r.status]} border ml-auto`}>
                    {STATUS_LABEL[r.status]}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  👤 {r.profiles?.full_name ?? "—"}
                  {r.profiles?.whatsapp && ` · 📱 ${r.profiles.whatsapp}`}
                  {` · ${new Date(r.created_at).toLocaleString("pt-BR")}`}
                </p>
                {r.notes && (
                  <p className="text-xs text-muted-foreground mt-1">📝 {r.notes}</p>
                )}
                {r.rejection_reason && (
                  <p className="text-xs text-red-400 mt-1">Motivo: {r.rejection_reason}</p>
                )}
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                {r.status !== "processing" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => changeStatus.mutate({ id: r.id, status: "processing" })}
                    disabled={changeStatus.isPending}
                  >
                    <Play className="h-3.5 w-3.5 mr-1" />
                    Processar
                  </Button>
                )}
                {r.status !== "added" && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500"
                    onClick={() => changeStatus.mutate({ id: r.id, status: "added" })}
                    disabled={changeStatus.isPending}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Adicionado
                  </Button>
                )}
                {r.status !== "rejected" && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setRejectTarget(r)}
                    disabled={changeStatus.isPending}
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Recusar
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Excluir "${r.title}"?`)) deleteRequest.mutate(r.id);
                  }}
                  disabled={deleteRequest.isPending}
                  className="h-9 w-9 text-muted-foreground hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar pedido</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Informe o motivo. O cliente será notificado no WhatsApp.
          </p>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Ex: Título indisponível na fonte..."
            maxLength={500}
            rows={4}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                rejectTarget &&
                changeStatus.mutate({
                  id: rejectTarget.id,
                  status: "rejected",
                  rejection_reason: rejectReason || null,
                })
              }
              disabled={changeStatus.isPending}
            >
              {changeStatus.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar recusa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "yellow" | "blue" | "emerald" | "red";
  icon: React.ReactNode;
}) {
  const tones = {
    yellow: "text-yellow-400 bg-yellow-500/15",
    blue: "text-blue-400 bg-blue-500/15",
    emerald: "text-emerald-400 bg-emerald-500/15",
    red: "text-red-400 bg-red-500/15",
  };
  return (
    <div className="glass-card rounded-2xl p-4 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${tones[tone]}`}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold font-display">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
