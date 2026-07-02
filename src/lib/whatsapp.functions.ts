import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---- Helpers ----

function getConfig() {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  return {
    baseUrl: baseUrl?.replace(/\/$/, "") ?? "",
    apiKey: apiKey ?? "",
    instance: instance ?? "",
    configured: !!(baseUrl && apiKey && instance),
  };
}

async function evoFetch(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: unknown; text: string }> {
  const { baseUrl, apiKey } = getConfig();
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data, text };
}

async function assertAdmin(supabase: {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
}, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

// ---- Types ----

export type WhatsappStatus = {
  configured: boolean;
  instance: string;
  state: "open" | "connecting" | "close" | "unknown" | "not_found";
  qrCode: string | null; // data:image/png;base64,... or base64 string
  pairingCode: string | null;
  ownerJid: string | null;
  profileName: string | null;
  profilePictureUrl: string | null;
  message?: string;
};

// ---- Server Functions ----

export const getWhatsappStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WhatsappStatus> => {
    await assertAdmin(context.supabase as never, context.userId);

    const cfg = getConfig();
    const base: WhatsappStatus = {
      configured: cfg.configured,
      instance: cfg.instance,
      state: "unknown",
      qrCode: null,
      pairingCode: null,
      ownerJid: null,
      profileName: null,
      profilePictureUrl: null,
    };

    if (!cfg.configured) {
      return { ...base, message: "Evolution API não configurada. Adicione as chaves nos secrets." };
    }

    // 1. Check connection state
    const stateRes = await evoFetch(`/instance/connectionState/${encodeURIComponent(cfg.instance)}`);
    if (stateRes.status === 404) {
      return { ...base, state: "not_found", message: "Instância não existe. Clique em 'Criar instância'." };
    }
    if (!stateRes.ok) {
      return { ...base, message: `Erro ${stateRes.status}: ${stateRes.text.slice(0, 200)}` };
    }
    const stateData = stateRes.data as { instance?: { state?: string } } | null;
    const state = (stateData?.instance?.state ?? "unknown") as WhatsappStatus["state"];
    base.state = state;

    // 2. If connected, fetch profile details
    if (state === "open") {
      const infoRes = await evoFetch(`/instance/fetchInstances?instanceName=${encodeURIComponent(cfg.instance)}`);
      if (infoRes.ok && Array.isArray(infoRes.data)) {
        const inst = (infoRes.data as Array<Record<string, unknown>>)[0];
        if (inst) {
          base.ownerJid = (inst.ownerJid as string | undefined) ?? null;
          base.profileName = (inst.profileName as string | undefined) ?? null;
          base.profilePictureUrl = (inst.profilePicUrl as string | undefined) ?? null;
        }
      }
      return base;
    }

    // 3. If disconnected, fetch QR / pairing code
    if (state === "close" || state === "connecting") {
      const qrRes = await evoFetch(`/instance/connect/${encodeURIComponent(cfg.instance)}`);
      if (qrRes.ok && qrRes.data) {
        const d = qrRes.data as Record<string, unknown>;
        const qr = (d.base64 as string | undefined) ?? (d.qrcode as string | undefined) ?? null;
        const pairing = (d.pairingCode as string | undefined) ?? null;
        base.qrCode = qr;
        base.pairingCode = pairing;
      }
    }

    return base;
  });

export const createWhatsappInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const cfg = getConfig();
    if (!cfg.configured) throw new Error("Evolution API não configurada.");

    const res = await evoFetch(`/instance/create`, {
      method: "POST",
      body: JSON.stringify({
        instanceName: cfg.instance,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
    });
    if (!res.ok) throw new Error(`Erro ${res.status}: ${res.text.slice(0, 200)}`);
    return { ok: true };
  });

export const disconnectWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const cfg = getConfig();
    if (!cfg.configured) throw new Error("Evolution API não configurada.");

    const res = await evoFetch(`/instance/logout/${encodeURIComponent(cfg.instance)}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404)
      throw new Error(`Erro ${res.status}: ${res.text.slice(0, 200)}`);
    return { ok: true };
  });

export const restartWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const cfg = getConfig();
    if (!cfg.configured) throw new Error("Evolution API não configurada.");

    const res = await evoFetch(`/instance/restart/${encodeURIComponent(cfg.instance)}`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`Erro ${res.status}: ${res.text.slice(0, 200)}`);
    return { ok: true };
  });

export const deleteWhatsappInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const cfg = getConfig();
    if (!cfg.configured) throw new Error("Evolution API não configurada.");

    const res = await evoFetch(`/instance/delete/${encodeURIComponent(cfg.instance)}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404)
      throw new Error(`Erro ${res.status}: ${res.text.slice(0, 200)}`);
    return { ok: true };
  });

const sendTestSchema = z.object({
  number: z.string().min(8).max(20),
  message: z.string().min(1).max(1000),
});

export const sendWhatsappTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sendTestSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const cfg = getConfig();
    if (!cfg.configured) throw new Error("Evolution API não configurada.");

    const number = data.number.replace(/\D/g, "");
    const res = await evoFetch(`/message/sendText/${encodeURIComponent(cfg.instance)}`, {
      method: "POST",
      body: JSON.stringify({ number, text: data.message }),
    });
    if (!res.ok) throw new Error(`Erro ${res.status}: ${res.text.slice(0, 200)}`);
    return { ok: true };
  });
