import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ticketSchema = z.object({
  subject: z.string().min(3),
  description: z.string().min(10),
});

export const createTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => ticketSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ticket, error } = await (supabase as any)
      .from("tickets")
      .insert({
        user_id: userId,
        subject: data.subject,
        description: data.description,
        status: "aberto",
      })
      .select()
      .single();

    if (error) throw error;
    return ticket;
  });

export const getMyTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await (supabase as any)
      .from("tickets")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return data ?? [];
  });

export const getTicketDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((id: string) => z.string().parse(id))
  .handler(async ({ data: id, context }) => {
    const { supabase } = context;
    const { data: ticket, error: tError } = await (supabase as any)
      .from("tickets")
      .select("*, profile:profiles!tickets_user_id_fkey(full_name, whatsapp)")
      .eq("id", id)
      .single();

    if (tError) throw tError;

    const { data: messages, error: mError } = await (supabase as any)
      .from("ticket_messages")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    if (mError) throw mError;

    return { ticket, messages: messages ?? [] };
  });

export const replyTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ ticketId: z.string(), message: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });

    const { data: msg, error } = await (supabase as any)
      .from("ticket_messages")
      .insert({
        ticket_id: data.ticketId,
        user_id: userId,
        message: data.message,
        is_admin: !!isAdmin,
      })
      .select()
      .single();

    if (error) throw error;

    if (isAdmin) {
      await (supabase as any)
        .from("tickets")
        .update({ status: "em_atendimento" })
        .eq("id", data.ticketId);

      try {
        const { data: ticket } = await (supabase as any)
          .from("tickets")
          .select("user_id, subject")
          .eq("id", data.ticketId)
          .single();

        if (ticket) {
          const { data: profile } = await (supabase as any)
            .from("profiles")
            .select("whatsapp")
            .eq("id", ticket.user_id)
            .single();

          if (profile?.whatsapp) {
            const { sendWhatsapp } = await import("./whatsapp.server");
            await sendWhatsapp(
              profile.whatsapp,
              `🎫 *Suporte: ${ticket.subject}*\n\nOlá! Seu chamado recebeu uma nova resposta da nossa equipe.\n\n_Acesse o portal para conferir._`
            );
          }
        }
      } catch (e) {
        console.error("Erro ao notificar usuário sobre resposta no ticket:", e);
      }
    }

    return msg;
  });

export const closeTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((id: string) => z.string().parse(id))
  .handler(async ({ data: id, context }) => {
    const { error } = await (context.supabase as any)
      .from("tickets")
      .update({ status: "concluido" })
      .eq("id", id);
    if (error) throw error;
    return true;
  });

export const getAllTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { data, error } = await (supabase as any)
      .from("tickets")
      .select("*, profile:profiles!tickets_user_id_fkey(full_name, whatsapp)")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data ?? [];
  });
