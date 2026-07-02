import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Search, ShieldCheck, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listUsers } from "@/lib/admin.functions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
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
  component: UsersPage,
});

function UsersPage() {
  const listFn = useServerFn(listUsers);
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listFn(),
  });

  const users = data?.users ?? [];
  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.whatsapp?.includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Usuários cadastrados</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {users.length} {users.length === 1 ? "conta" : "contas"} no portal.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, e-mail ou WhatsApp..."
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="glass-card rounded-2xl p-8 text-center text-red-400">
          {error instanceof Error ? error.message : "Erro ao carregar usuários."}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center text-muted-foreground">
          Nenhum usuário encontrado.
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-card/60 border-b border-border/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Nome</th>
                  <th className="text-left p-3">WhatsApp</th>
                  <th className="text-left p-3">E-mail</th>
                  <th className="text-left p-3">Papel</th>
                  <th className="text-left p-3">Cadastro</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-border/30 hover:bg-accent/5">
                    <td className="p-3 font-medium">{u.full_name ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{u.whatsapp ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{u.email ?? "—"}</td>
                    <td className="p-3">
                      {u.role === "admin" ? (
                        <Badge className="bg-primary/15 text-primary border-primary/30">
                          <ShieldCheck className="h-3 w-3 mr-1" /> Admin
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          <User className="h-3 w-3 mr-1" /> {u.role}
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
