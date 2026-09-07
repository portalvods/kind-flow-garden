// Assistente de IA que responde os clientes no WhatsApp.
import { getServerEnv } from "./env.server";

export type ClientStatus = {
  ok: boolean;
  code: string;
  name?: string | null;
  blocked?: boolean;
  limit?: number;
  used?: number;
  requests?: Array<{
    title: string;
    status: string;
    kind: string;
    type: string;
    rejection_reason: string | null;
    created: string;
  }>;
};

export type AiDecision = {
  action: "create_request" | "answer";
  title?: string;
  content_type?: "movie" | "tv";
  request_kind?: "adicao" | "atualizacao" | "conserto";
  reply: string;
};

const STATUS_PT: Record<string, string> = {
  pending: "aguardando análise",
  analyzing: "em análise",
  approved: "aprovado",
  processing: "em processamento",
  added: "adicionado",
  completed: "concluído",
  fixed: "corrigido",
  rejected: "recusado",
};

function describeStatus(s: ClientStatus): string {
  if (!s.ok || s.code !== "found") {
    return "O número não está cadastrado no site.";
  }
  const reqs = (s.requests ?? [])
    .map(
      (r) =>
        `- "${r.title}" (${r.type === "tv" ? "série" : "filme"}, ${r.kind}) — ${STATUS_PT[r.status] ?? r.status}${
          r.rejection_reason ? ` (motivo: ${r.rejection_reason})` : ""
        } — pedido em ${r.created}`,
    )
    .join("\n");
  return [
    `Cliente: ${s.name ?? "sem nome"}`,
    s.blocked ? "ATENÇÃO: conta bloqueada." : "Conta ativa.",
    `Pedidos usados hoje: ${s.used}/${s.limit}`,
    reqs ? `Últimos pedidos:\n${reqs}` : "Ainda não fez nenhum pedido.",
  ].join("\n");
}

export async function askBotAi(params: {
  message: string;
  status: ClientStatus;
  ordersEnabled: boolean;
  history: Array<{ direction: "in" | "out"; body: string }>;
}): Promise<AiDecision | null> {
  const apiKey = getServerEnv("LOVABLE_API_KEY");
  if (!apiKey) return null;

  const system = [
    "Você é o atendente virtual de um portal de pedidos de filmes e séries, no WhatsApp.",
    "Responda sempre em português do Brasil, curto (máximo 4 linhas), simpático, sem inventar informações.",
    "Você conhece a situação do cliente abaixo e deve usá-la para responder sobre pedidos, status e limite diário.",
    params.ordersEnabled
      ? "O cliente PODE fazer pedidos pelo WhatsApp. Se ele estiver pedindo um filme ou série, use a ação create_request."
      : "Os pedidos pelo WhatsApp estão DESATIVADOS: se ele pedir um conteúdo, oriente a fazer pelo site.",
    "Nunca prometa prazos exatos. Nunca peça dados sensíveis.",
    "",
    "SITUAÇÃO DO CLIENTE:",
    describeStatus(params.status),
    "",
    "Responda SOMENTE com um JSON válido no formato:",
    '{"action":"create_request"|"answer","title":"nome do conteúdo","content_type":"movie"|"tv","request_kind":"adicao"|"atualizacao"|"conserto","reply":"mensagem para o cliente"}',
    'Use "answer" quando não for um pedido de conteúdo novo. Em "create_request", o campo reply deve ser a confirmação do pedido.',
  ].join("\n");

  const messages = [
    { role: "system", content: system },
    ...params.history.slice(-6).map((h) => ({
      role: h.direction === "in" ? "user" : "assistant",
      content: h.body.slice(0, 500),
    })),
    { role: "user", content: params.message.slice(0, 1000) },
  ];

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        reasoning_effort: "low",
        messages,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn("[bot-ai] gateway error", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleaned) as AiDecision;
    if (!parsed?.reply) return null;
    if (parsed.action !== "create_request") parsed.action = "answer";
    return parsed;
  } catch (err) {
    console.warn("[bot-ai] failed", (err as Error).message);
    return null;
  }
}
