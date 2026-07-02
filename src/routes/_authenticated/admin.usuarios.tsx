import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Ban, CheckCircle2, Loader2, Pencil, Search, ShieldCheck, Trash2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { deleteUser, listUsers, setUserBlocked, updateUser } from "@/lib/admin.functions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

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

type AdminUser = {
  id: string;
  full_name: string | null;
  whatsapp: string | null;
  email: string | null;
  role: string;
  blocked: boolean;
  created_at: string;
};

function UsersPage() {
  const listFn = useServerFn(listUsers);
  const updateFn = useServerFn(updateUser);
  const deleteFn = useServerFn(deleteUser);
  const blockFn = useServerFn(setUserBlocked);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [form, setForm] = useState({ full_name: "", whatsapp: "", email: "" });

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listFn(),
  });

  const users = (data?.users ?? []) as AdminUser[];
  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.whatsapp?.includes(q)
    );
  });

  function openEdit(u: AdminUser) {
    setEditing(u);
    setForm({
      full_name: u.full_name ?? "",
      whatsapp: u.whatsapp ?? "",
      email: u.email ?? "",
    });
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy("save");
    try {
      await updateFn({
        data: {
          userId: editing.id,
          full_name: form.full_name,
          whatsapp: form.whatsapp,
          email: form.email,
        },
      });
      toast.success("Usuário atualizado.");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleBlock(u: AdminUser) {
    setBusy(u.id);
    try {
      await blockFn({ data: { userId: u.id, blocked: !u.blocked } });
      toast.success(u.blocked ? "Usuário desbloqueado." : "Usuário bloqueado.");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (!deletingUser) return;
    setBusy("delete");
    try {
      await deleteFn({ data: { userId: deletingUser.id } });
      toast.success("Usuário excluído.");
      setDeletingUser(null);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir.");
    } finally {
      setBusy(null);
    }
  }

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
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Cadastro</th>
                  <th className="text-right p-3">Ações</th>
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
                    <td className="p-3">
                      {u.blocked ? (
                        <Badge className="bg-red-500/15 text-red-400 border-red-500/30">Bloqueado</Badge>
                      ) : (
                        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Ativo</Badge>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(u)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === u.id}
                          onClick={() => toggleBlock(u)}
                          title={u.blocked ? "Desbloquear" : "Bloquear"}
                        >
                          {busy === u.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : u.blocked ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <Ban className="h-4 w-4 text-amber-400" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeletingUser(u)}
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <DialogDescription>Altere nome, e-mail ou WhatsApp deste usuário.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div>
              <Label>WhatsApp (somente números com DDD)</Label>
              <Input value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={busy === "save"}>
              {busy === "save" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. A conta de <b>{deletingUser?.full_name ?? deletingUser?.email}</b> será removida
              junto com seus dados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={busy === "delete"}>
              {busy === "delete" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
