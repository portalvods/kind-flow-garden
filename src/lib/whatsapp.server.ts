// Evolution API notifier — no-ops silently when secrets are not configured.
// Configure by adding secrets: EVOLUTION_API_URL, EVOLUTION_API_KEY,
// EVOLUTION_INSTANCE, and ADMIN_WHATSAPP.

function sanitizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export async function sendWhatsapp(to: string, message: string): Promise<void> {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!baseUrl || !apiKey || !instance) {
    console.info("[whatsapp] Evolution API not configured; skipping notification");
    return;
  }
  const number = sanitizePhone(to);
  if (!number) return;

  try {
    const url = `${baseUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(instance)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number,
        text: message,
      }),
    });
    if (!res.ok) {
      console.warn("[whatsapp] Evolution API returned", res.status, await res.text());
    }
  } catch (err) {
    console.error("[whatsapp] send failed", err);
  }
}

export function notifyAdminNewRequest(details: {
  clientName: string;
  clientWhatsapp: string | null;
  title: string;
  contentType: "movie" | "tv";
  year: number | null;
  notes: string | null;
}): Promise<void> {
  const adminNumber = process.env.ADMIN_WHATSAPP;
  if (!adminNumber) {
    console.info("[whatsapp] ADMIN_WHATSAPP not set; skipping admin notification");
    return Promise.resolve();
  }
  const typeLabel = details.contentType === "movie" ? "Filme" : "Série";
  const message =
    `🎬 *Novo pedido no Portal VOD*\n\n` +
    `👤 Cliente: ${details.clientName}\n` +
    (details.clientWhatsapp ? `📱 WhatsApp: ${details.clientWhatsapp}\n` : "") +
    `🎯 ${typeLabel}: *${details.title}*${details.year ? ` (${details.year})` : ""}\n` +
    (details.notes ? `📝 Observações: ${details.notes}\n` : "") +
    `\nAcesse o painel para gerenciar.`;
  return sendWhatsapp(adminNumber, message);
}

export function notifyClientStatusChange(details: {
  clientWhatsapp: string | null;
  title: string;
  status: "pending" | "processing" | "added" | "rejected";
  rejectionReason: string | null;
}): Promise<void> {
  if (!details.clientWhatsapp) return Promise.resolve();
  const messages: Record<typeof details.status, string> = {
    pending: `⏳ Seu pedido de *${details.title}* está na fila.`,
    processing: `⚙️ Estamos processando seu pedido de *${details.title}*.`,
    added: `✅ Boa notícia! *${details.title}* já está disponível no servidor. Aproveite!`,
    rejected:
      `❌ Infelizmente não foi possível adicionar *${details.title}*.` +
      (details.rejectionReason ? `\n\nMotivo: ${details.rejectionReason}` : ""),
  };
  return sendWhatsapp(details.clientWhatsapp, messages[details.status]);
}
