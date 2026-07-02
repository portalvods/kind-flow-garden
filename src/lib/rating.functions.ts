// Rating: request owner can thumbs up/down after completion.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rateSchema = z.object({
  id: z.string().uuid(),
  rating: z.union([z.literal(1), z.literal(-1)]),
  comment: z.string().trim().max(500).optional().nullable(),
});

export const rateRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: row, error: fetchErr } = await supabase
      .from("requests")
      .select("id, user_id, status, rating")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!row) throw new Error("Pedido não encontrado.");
    if (row.user_id !== userId) throw new Error("Você só pode avaliar seus próprios pedidos.");
    if (!["completed", "fixed", "added"].includes(String(row.status))) {
      throw new Error("Só pode avaliar pedidos concluídos.");
    }
    if (row.rating !== null && row.rating !== undefined) {
      throw new Error("Este pedido já foi avaliado.");
    }

    const { error } = await supabase
      .from("requests")
      .update({
        rating: data.rating,
        rating_comment: data.comment ?? null,
        rated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
