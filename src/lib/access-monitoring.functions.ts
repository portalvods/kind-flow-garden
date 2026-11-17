import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const summarySchema = z.object({
  today_clients: z.number(), today_views: z.number(), period_clients: z.number(),
  pages: z.array(z.object({ page: z.string(), views: z.number(), clients: z.number() })),
  daily: z.array(z.object({ date: z.string(), clients: z.number(), views: z.number() })),
});
export const getAccessSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ days: z.union([z.literal(1), z.literal(7), z.literal(30)]) }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: summary, error } = await context.supabase.rpc("admin_access_summary", { _days: data.days });
    if (error) throw new Error("Não foi possível carregar os acessos.");
    return summarySchema.parse(summary);
  });