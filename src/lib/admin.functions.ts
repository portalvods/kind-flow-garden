// Admin-only server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AdminUser = {
  id: string;
  full_name: string | null;
  whatsapp: string | null;
  email: string | null;
  role: string;
  blocked: boolean;
  created_at: string;
};

type RpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

async function assertAdmin(context: { supabase: unknown; userId: string }) {
  const client = context.supabase as RpcClient;
  const { data, error } = await client.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado.");
}

async function callAdminRpc(context: { supabase: unknown }, name: string, args: Record<string, unknown>) {
  const client = context.supabase as RpcClient;
  const { error } = await client.rpc(name, args);
  if (error) throw new Error(error.message);
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ users: AdminUser[] }> => {
    const client = context.supabase as unknown as {
      rpc: (name: string) => Promise<{ data: AdminUser[] | null; error: { message: string } | null }>;
    };
    const { data, error } = await client.rpc("admin_list_users");
    if (error) throw new Error(error.message);
    return { users: data ?? [] };
  });

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; full_name?: string; whatsapp?: string; email?: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await callAdminRpc(context, "admin_update_user", {
      _user_id: data.userId,
      _full_name: data.full_name ?? "",
      _whatsapp: data.whatsapp ?? "",
      _email: data.email ?? "",
    });

    return { ok: true };
  });

export const setUserBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; blocked: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Você não pode bloquear a si mesmo.");

    await callAdminRpc(context, "admin_set_user_blocked", {
      _user_id: data.userId,
      _blocked: data.blocked,
    });
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Você não pode excluir a si mesmo.");

    await callAdminRpc(context, "admin_soft_delete_user", { _user_id: data.userId });
    return { ok: true };
  });
