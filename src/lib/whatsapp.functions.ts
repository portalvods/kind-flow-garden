import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getServerEnv } from "./env.server";

// ---- Helpers ----

const runtimeConfigSchema = z.object({
  baseUrl: z.string().trim().optional(),
  apiKey: z.string().trim().optional(),
  instance: z.string().trim().optional(),
});

const configPayloadSchema = z.object({
  config: runtimeConfigSchema.optional(),
});

type RuntimeConfigPayload = z.infer<typeof configPayloadSchema>;

function getNestedString(value: unknown, path: string[]): string | null {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current.trim() ? current.trim() : null;
}

function findFirstString(value: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    const found = getNestedString(value, path);
    if (found) return found;
  }
  return null;
}

function normalizeConnectionState(value: unknown): WhatsappStatus["state"] {
  const raw = String(value ?? "unknown").toLowerCase();
  if (raw === "open") return "open";
  if (raw === "connecting") return "connecting";
  if (raw === "close" || raw === "closed" || raw === "disconnect" || raw === "disconnected") return "close";
  return "unknown";
}

function getConfig(payload?: RuntimeConfigPayload) {
  const overrideBaseUrl = payload?.config?.baseUrl?.trim();
  const overrideApiKey = payload?.config?.apiKey?.trim();
  const overrideInstance = payload?.config?.instance?.trim();

  // Merge por campo: qualquer valor vindo do painel sobrescreve o env.
  const baseUrl = overrideBaseUrl || getServerEnv("EVOLUTION_API_URL") || "";
  const apiKey = overrideApiKey || getServerEnv("EVOLUTION_API_KEY") || "";
  const instance = overrideInstance || getServerEnv("EVOLUTION_INSTANCE") || "";

  const usedPanel = !!(overrideBaseUrl || overrideApiKey || overrideInstance);

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey,
    instance,
    source: usedPanel ? "panel" : "server",
    configured: !!(baseUrl && apiKey && instance),
  };
}


async function evoFetch(
  path: string,
  payload?: RuntimeConfigPayload,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: unknown; text: string }> {
  const { baseUrl, apiKey } = getConfig(payload);
  const url = `${baseUrl}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
        "x-api-key": apiKey,
        Authorization: `Bearer ${apiKey}`,
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha de conexão";
    return {
      ok: false,
      status: 0,
      data: null,
      text: `Não consegui conectar na Evolution API em ${url}. Detalhe: ${message}`,
    };
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data, text };
}

function formatEvoError(status: number, text: string): string {
  const cleanText = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const shortText = cleanText.slice(0, 220) || "sem detalhes";

  if (status === 403 && /1003/.test(cleanText)) {
    return "Erro 403/1003: a URL da Evolution está apontando para um endereço bloqueado pelo Cloudflare ou para o host errado. Use a URL direta da VPS com porta 8080, ou deixe o domínio da API como DNS only/sem proxy.";
  }

  if (status === 401 || status === 403) {
    return `Erro ${status}: a Evolution recusou a chave API. Confira se a chave no painel é exatamente a mesma AUTHENTICATION_API_KEY da VPS. Detalhe: ${shortText}`;
  }

  return `Erro ${status}: ${shortText}`;
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
  configSource: "server" | "panel";
  endpoint: string | null;
  state: "open" | "connecting" | "close" | "unknown" | "not_found";
  qrCode: string | null; // data:image/png;base64,... or base64 string
  pairingCode: string | null;
  ownerJid: string | null;
  profileName: string | null;
  profilePictureUrl: string | null;
  message?: string;
};

// ---- Server Functions ----

export const getWhatsappStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => configPayloadSchema.parse(data ?? {}))
  .handler(async ({ context, data }): Promise<WhatsappStatus> => {
    await assertAdmin(context.supabase as never, context.userId);

    const cfg = getConfig(data);
    const base: WhatsappStatus = {
      configured: cfg.configured,
      instance: cfg.instance,
      configSource: cfg.source as "server" | "panel",
      endpoint: cfg.baseUrl || null,
      state: "unknown",
      qrCode: null,
      pairingCode: null,
      ownerJid: null,
      profileName: null,
      profilePictureUrl: null,
    };

    if (!cfg.configured) {
      const missing: string[] = [];
      if (!cfg.baseUrl) missing.push("URL");
      if (!cfg.apiKey) missing.push("Chave API");
      if (!cfg.instance) missing.push("Instância");
      return {
        ...base,
        message: `Faltando: ${missing.join(", ")}. Preencha nos campos acima e clique em Aplicar configuração.`,
      };
    }

    // 1. Check connection state
    const stateRes = await evoFetch(`/instance/connectionState/${encodeURIComponent(cfg.instance)}`, data);
    if (stateRes.status === 404) {
      return { ...base, state: "not_found", message: "Instância não existe. Clique em 'Criar instância'." };
    }
    if (!stateRes.ok) {
      return { ...base, message: formatEvoError(stateRes.status, stateRes.text) };
    }
    const state = normalizeConnectionState(
      findFirstString(stateRes.data, [
        ["instance", "state"],
        ["state"],
        ["connectionState"],
      ]),
    );
    base.state = state;

    // 2. If connected, fetch profile details
    if (state === "open") {
      const infoRes = await evoFetch(`/instance/fetchInstances?instanceName=${encodeURIComponent(cfg.instance)}`, data);
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
    if (state === "close" || state === "connecting" || state === "unknown") {
      const qrRes = await evoFetch(`/instance/connect/${encodeURIComponent(cfg.instance)}`, data);
      if (qrRes.ok && qrRes.data) {
        const qr = findFirstString(qrRes.data, [
          ["base64"],
          ["qrcode"],
          ["qrCode"],
          ["qr"],
          ["code"],
          ["qrcode", "base64"],
          ["qrcode", "code"],
          ["data", "base64"],
          ["data", "qrcode"],
          ["data", "qrCode"],
          ["data", "qr"],
          ["data", "code"],
        ]);
        const pairing = findFirstString(qrRes.data, [
          ["pairingCode"],
          ["pairing_code"],
          ["data", "pairingCode"],
          ["data", "pairing_code"],
        ]);
        base.qrCode = qr;
        base.pairingCode = pairing;
        if (!qr && !pairing) {
          base.message = "A Evolution respondeu, mas não enviou QR Code. Tente criar/reiniciar a instância.";
        }
      } else if (!qrRes.ok) {
        base.message = `Não consegui gerar o QR Code. ${formatEvoError(qrRes.status, qrRes.text)}`;
      }
    }

    return base;
  });

export const createWhatsappInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => configPayloadSchema.parse(data ?? {}))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const cfg = getConfig(data);
    if (!cfg.configured) throw new Error("Evolution API não configurada.");

    const res = await evoFetch(`/instance/create`, {
      ...data,
    }, {
      method: "POST",
      body: JSON.stringify({
        instanceName: cfg.instance,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
    });
    if (!res.ok) throw new Error(formatEvoError(res.status, res.text));
    return { ok: true };
  });

export const disconnectWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => configPayloadSchema.parse(data ?? {}))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const cfg = getConfig(data);
    if (!cfg.configured) throw new Error("Evolution API não configurada.");

    const res = await evoFetch(`/instance/logout/${encodeURIComponent(cfg.instance)}`, data, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404)
      throw new Error(formatEvoError(res.status, res.text));
    return { ok: true };
  });

export const restartWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => configPayloadSchema.parse(data ?? {}))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const cfg = getConfig(data);
    if (!cfg.configured) throw new Error("Evolution API não configurada.");

    const res = await evoFetch(`/instance/restart/${encodeURIComponent(cfg.instance)}`, data, {
      method: "POST",
    });
    if (!res.ok) throw new Error(formatEvoError(res.status, res.text));
    return { ok: true };
  });

export const deleteWhatsappInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => configPayloadSchema.parse(data ?? {}))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const cfg = getConfig(data);
    if (!cfg.configured) throw new Error("Evolution API não configurada.");

    const res = await evoFetch(`/instance/delete/${encodeURIComponent(cfg.instance)}`, data, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404)
      throw new Error(formatEvoError(res.status, res.text));
    return { ok: true };
  });

const sendTestSchema = z.object({
  number: z.string().min(8).max(20),
  message: z.string().min(1).max(1000),
  config: runtimeConfigSchema.optional(),
});

export const sendWhatsappTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sendTestSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const cfg = getConfig(data);
    if (!cfg.configured) throw new Error("Evolution API não configurada.");

    const number = data.number.replace(/\D/g, "");
    const res = await evoFetch(`/message/sendText/${encodeURIComponent(cfg.instance)}`, data, {
      method: "POST",
      body: JSON.stringify({ number, text: data.message }),
    });
    if (!res.ok) throw new Error(formatEvoError(res.status, res.text));
    return { ok: true };
  });
