import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { sendWhatsAppNotification } from "./whatsapp.functions";

const ticketSchema = z.object({
  subject: z.string().min(3),
  description: z.string().min(10),
});

export const createTicket = createServerFn({ method: "POST" })
  .inputValidator((data) => ticketSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: ticket, error } = await supabase
      .from("tickets")
      .insert({
        user_id: user.id,
        subject: data.subject,
        description: data.description,
        status: "aberto"
      })
      .select()
      .single();

    if (error) throw error;

    // Notificar admin via WhatsApp se configurado
    try {
      // Aqui poderíamos buscar o telefone do admin nas configurações e enviar
      // Por enquanto vamos apenas registrar o ticket
      console.log("Ticket criado:", ticket.id);
    } catch (e) {
      console.error("Erro ao notificar admin sobre ticket:", e);
    }

    return ticket;
  });

export const getMyTickets = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return data;
  });

export const getTicketDetails = createServerFn({ method: "GET" })
  .inputValidator((id: string) => z.string().parse(id))
  .handler(async ({ data: id }) => {
    const { data: ticket, error: tError } = await supabase
      .from("tickets")
      .select("*, profile:user_id(full_name, whatsapp)")
      .eq("id", id)
      .single();

    if (tError) throw tError;

    const { data: messages, error: mError } = await supabase
      .from("ticket_messages")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    if (mError) throw mError;

    return { ticket, messages };
  });

export const replyTicket = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ ticketId: z.string(), message: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Verificar se é admin
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    const isAdmin = !!role;

    const { data: msg, error } = await supabase
      .from("ticket_messages")
      .insert({
        ticket_id: data.ticketId,
        user_id: user.id,
        message: data.message,
        is_admin: isAdmin
      })
      .select()
      .single();

    if (error) throw error;

    // Atualizar status se admin responder
    if (isAdmin) {
      await supabase
        .from("tickets")
        .update({ status: "em_atendimento" })
        .eq("id", data.ticketId);
        
      // Notificar usuário via WhatsApp se admin responder
      try {
        const { data: ticket } = await supabase
          .from("tickets")
          .select("user_id, subject")
          .eq("id", data.ticketId)
          .single();
          
        if (ticket) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("whatsapp")
            .eq("id", ticket.user_id)
            .single();
            
          if (profile?.whatsapp) {
            await sendWhatsAppNotification({
              to: profile.whatsapp,
              message: `🎫 *Suporte ${ticket.subject}*\n\nOlá! Sua solicitação de suporte recebeu uma nova resposta da nossa equipe.\n\n_Acesse o portal para conferir._`
            });
          }
        }
      } catch (e) {
        console.error("Erro ao notificar usuário sobre resposta no ticket:", e);
      }
    }

    return msg;
  });

export const closeTicket = createServerFn({ method: "POST" })
  .inputValidator((id: string) => z.string().parse(id))
  .handler(async ({ data: id }) => {
    const { error } = await supabase
      .from("tickets")
      .update({ status: "concluido" })
      .eq("id", id);
    if (error) throw error;
    return true;
  });
