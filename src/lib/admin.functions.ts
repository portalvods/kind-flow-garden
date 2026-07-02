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

async function assertAdmin(context: { supabase: unknown; userId: string }) {
  const client = context.supabase as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await client.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado.");
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const profileUpdate: Record<string, unknown> = {};
    if (data.full_name !== undefined) profileUpdate.full_name = data.full_name.trim();
    if (data.whatsapp !== undefined) profileUpdate.whatsapp = data.whatsapp.replace(/\D/g, "");
    if (data.email !== undefined) profileUpdate.email = data.email.trim().toLowerCase();

    if (Object.keys(profileUpdate).length > 0) {
      const { error } = await supabaseAdmin.from("profiles").update(profileUpdate).eq("id", data.userId);
      if (error) throw new Error(error.message);
    }

    if (data.email !== undefined) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        email: data.email.trim().toLowerCase(),
        email_confirm: true,
      });
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });

export const setUserBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; blocked: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Você não pode bloquear a si mesmo.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ blocked: data.blocked })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    // Revoke active sessions when blocking
    if (data.blocked) {
      await supabaseAdmin.auth.admin.signOut(data.userId).catch(() => {});
    }
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Você não pode excluir a si mesmo.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    // Profile will cascade via ON DELETE CASCADE on auth.users if configured; ensure cleanup:
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    return { ok: true };
  });
