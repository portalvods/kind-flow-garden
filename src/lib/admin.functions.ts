// Admin-only server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AdminUser = {
  id: string;
  full_name: string | null;
  whatsapp: string | null;
  email: string | null;
  role: string;
  created_at: string;
};

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
