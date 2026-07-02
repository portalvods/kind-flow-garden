import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendTemplate, getAdminWhatsappNumber } from "./whatsapp.server";
import { normalizeTitle } from "./m3u.server";

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content_type: z.enum(["movie", "tv"]),
  request_kind: z.enum(["adicao", "atualizacao", "conserto"]).default("adicao"),
  format: z.string().trim().max(50).nullable().optional(),
  tmdb_id: z.number().int().nullable().optional(),
  poster_path: z.string().max(300).nullable().optional(),
  year: z.number().int().min(1900).max(2100).nullable().optional(),
  overview: z.string().max(2000).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const KIND_LABEL: Record<string, string> = {
  adicao: "Adição",
  atualizacao: "Atualização",
  conserto: "Conserto",
};

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "processing", "analyzing", "approved", "added", "completed", "fixed", "rejected"]),
  rejection_reason: z.string().max(500).nullable().optional(),
});

export const createRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Enforce daily request limit (admins are exempt)
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) {
      const { data: limitRow } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "daily_request_limit")
        .maybeSingle();
      const dailyLimit = Number(limitRow?.value ?? 5) || 5;
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("requests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", startOfDay.toISOString());
      if ((count ?? 0) >= dailyLimit) {
        throw new Error(`Limite diário atingido (${dailyLimit} pedidos/dia). Tente novamente amanhã.`);
      }
    }

    // Availability check: block "adicao" if content already in M3U catalog
    if (data.request_kind === "adicao") {
      const catalogKind = data.content_type === "tv" ? "series" : "movie";
      const norm = normalizeTitle(data.title);
      let match: { category: string | null; title: string } | null = null;

      if (data.tmdb_id) {
        const { data: byTmdb } = await supabase
          .from("catalog_items")
          .select("category, title")
          .eq("tmdb_id", data.tmdb_id)
          .eq("kind", catalogKind)
          .limit(1);
        if (byTmdb && byTmdb.length) match = byTmdb[0];
      }
      if (!match && data.year) {
        const { data: byBoth } = await supabase
          .from("catalog_items")
          .select("category, title")
          .eq("title_normalized", norm)
          .eq("year", data.year)
          .eq("kind", catalogKind)
          .limit(1);
        if (byBoth && byBoth.length) match = byBoth[0];
      }
      if (!match) {
        const { data: byTitle } = await supabase
          .from("catalog_items")
          .select("category, title")
          .eq("title_normalized", norm)
          .eq("kind", catalogKind)
          .limit(1);
        if (byTitle && byTitle.length) match = byTitle[0];
      }
      if (match) {
        const where = match.category ? ` (categoria: ${match.category})` : "";
        throw new Error(
          `Este conteúdo já está disponível no catálogo${where}. Se você quer atualização ou conserto, mude o tipo de solicitação.`,
        );
      }
    }


    const { data: request, error } = await supabase
      .from("requests")
      .insert({
        user_id: userId,
        title: data.title,
        content_type: data.content_type,
        request_kind: data.request_kind,
        format: data.format ?? null,
        tmdb_id: data.tmdb_id ?? null,
        poster_path: data.poster_path ?? null,
        year: data.year ?? null,
        overview: data.overview ?? null,
        notes: data.notes ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, whatsapp")
      .eq("id", userId)
      .maybeSingle();

    const vars = {
      cliente: profile?.full_name ?? "Cliente",
      whatsapp: profile?.whatsapp ?? "",
      titulo: data.title,
      tipo: KIND_LABEL[data.request_kind],
      formato: data.format ?? "—",
      obs: data.notes ?? "—",
    };

    // Notify client (received)
    try {
      await sendTemplate(profile?.whatsapp ?? null, "received", vars, { supabase });
    } catch (err) {
      console.error("client notify received failed", err);
    }

    // Notify admin
    try {
      const adminNumber = await getAdminWhatsappNumber({ supabase });
      if (adminNumber) await sendTemplate(adminNumber, "admin_new_request", vars, { supabase });
    } catch (err) {
      console.error("admin notify failed", err);
    }

    return { id: request.id };
  });

export const updateRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateStatusSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: adminRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRow) throw new Error("Forbidden");

    const { data: current, error: fetchErr } = await supabase
      .from("requests")
      .select("id, user_id, title, status, request_kind, format")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr || !current) throw new Error("Pedido não encontrado");

    const { error: updateErr } = await supabase
      .from("requests")
      .update({
        status: data.status,
        rejection_reason: data.status === "rejected" ? (data.rejection_reason ?? null) : null,
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, whatsapp")
      .eq("id", current.user_id)
      .maybeSingle();

    // Map status -> template key
    const key =
      data.status === "analyzing" || data.status === "processing"
        ? "analyzing"
        : data.status === "approved"
          ? "approved"
          : data.status === "completed" || data.status === "added"
            ? "completed"
            : data.status === "fixed"
              ? "fixed"
              : data.status === "rejected"
                ? "rejected"
                : null;

    if (key) {
      try {
        await sendTemplate(
          profile?.whatsapp ?? null,
          key,
          {
            cliente: profile?.full_name ?? "Cliente",
            titulo: current.title,
            tipo: KIND_LABEL[current.request_kind as string] ?? "",
            formato: (current.format as string | null) ?? "—",
            motivo: data.rejection_reason ?? "—",
          },
          { supabase },
        );
      } catch (err) {
        console.error("Client notification failed", err);
      }
    }

    return { ok: true };
  });
