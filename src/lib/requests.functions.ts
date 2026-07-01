import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content_type: z.enum(["movie", "tv"]),
  tmdb_id: z.number().int().nullable().optional(),
  poster_path: z.string().max(300).nullable().optional(),
  year: z.number().int().min(1900).max(2100).nullable().optional(),
  overview: z.string().max(2000).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "processing", "added", "rejected"]),
  rejection_reason: z.string().max(500).nullable().optional(),
});

/**
 * Creates a request for the authenticated user and notifies the admin via WhatsApp.
 */
export const createRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: request, error } = await supabase
      .from("requests")
      .insert({
        user_id: userId,
        title: data.title,
        content_type: data.content_type,
        tmdb_id: data.tmdb_id ?? null,
        poster_path: data.poster_path ?? null,
        year: data.year ?? null,
        overview: data.overview ?? null,
        notes: data.notes ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Load requester profile for the admin notification
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, whatsapp")
      .eq("id", userId)
      .maybeSingle();

    try {
      const { notifyAdminNewRequest } = await import("./whatsapp.server");
      await notifyAdminNewRequest({
        clientName: profile?.full_name ?? "Cliente",
        clientWhatsapp: profile?.whatsapp ?? null,
        title: data.title,
        contentType: data.content_type,
        year: data.year ?? null,
        notes: data.notes ?? null,
      });
    } catch (err) {
      console.error("Admin notification failed", err);
    }

    return { id: request.id };
  });

/**
 * Admin-only: change a request's status, log the change, notify the client via WhatsApp.
 */
export const updateRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateStatusSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify admin
    const { data: adminRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRow) throw new Error("Forbidden");

    // Fetch current
    const { data: current, error: fetchErr } = await supabase
      .from("requests")
      .select("id, user_id, title, status")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr || !current) throw new Error("Pedido não encontrado");

    const { error: updateErr } = await supabase
      .from("requests")
      .update({
        status: data.status,
        rejection_reason: data.status === "rejected" ? data.rejection_reason ?? null : null,
      })
      .eq("id", data.id);
    if (updateErr) throw new Error(updateErr.message);

    await supabase.from("request_logs").insert({
      request_id: data.id,
      changed_by: userId,
      from_status: current.status,
      to_status: data.status,
      note: data.rejection_reason ?? null,
    });

    // Notify client
    const { data: profile } = await supabase
      .from("profiles")
      .select("whatsapp")
      .eq("id", current.user_id)
      .maybeSingle();

    try {
      const { notifyClientStatusChange } = await import("./whatsapp.server");
      await notifyClientStatusChange({
        clientWhatsapp: profile?.whatsapp ?? null,
        title: current.title,
        status: data.status,
        rejectionReason: data.rejection_reason ?? null,
      });
    } catch (err) {
      console.error("Client notification failed", err);
    }

    return { ok: true };
  });
