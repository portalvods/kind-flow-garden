// AI-powered template matching: extracts titles from a provider's update
// template and matches them against open requests, so completed items can be
// marked and notified in bulk.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeTitle } from "./m3u.server";
import { sendTemplate } from "./whatsapp.server";
import { getServerEnv } from "./env.server";

type Ctx = { supabase: never; userId: string };

async function assertAdmin(context: Ctx) {
  const supabase = context.supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

// ---- Settings ----
export const getAiAutomation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { data } = await context.supabase
      .from("site_settings")
      .select("value")
      .eq("key", "ai_auto_match_enabled")
      .maybeSingle();
    return { enabled: (data?.value as string | null) === "true" };
  });

export const setAiAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase.from("site_settings").upsert({
      key: "ai_auto_match_enabled",
      value: data.enabled ? "true" : "false",
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- AI extraction ----
type ExtractedItem = { title: string; year: number | null };

async function extractViaLovable(text: string, key: string): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "Você extrai títulos de filmes e séries de um 'template' postado por um provedor VOD que lista conteúdos adicionados ou atualizados. Retorne APENAS JSON válido no formato: {\"items\":[{\"title\":\"Nome da obra\",\"year\":2024}]}. O campo year é opcional (use null se não houver). Um item por obra: não separe temporadas ou episódios em vários itens, retorne apenas o nome da série uma única vez. Ignore cabeçalhos, categorias, emojis, formatos (HD/4K/Dublado) e informações que não sejam títulos.",
        },
        { role: "user", content: `Extraia todos os títulos do template abaixo:\n\n${text.slice(0, 12000)}` },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("Limite de uso da IA excedido. Tente novamente em instantes.");
    if (res.status === 402) throw new Error("Créditos da IA esgotados. Adicione créditos no workspace da Lovable ou configure GEMINI_API_KEY na VPS.");
    throw new Error(`Falha na IA (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "{}";
}

async function extractViaGemini(text: string, key: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text:
            "Você extrai títulos de filmes e séries de um 'template' postado por um provedor VOD que lista conteúdos adicionados ou atualizados. Retorne APENAS JSON válido no formato: {\"items\":[{\"title\":\"Nome da obra\",\"year\":2024}]}. O campo year é opcional (use null se não houver). Um item por obra: não separe temporadas ou episódios em vários itens, retorne apenas o nome da série uma única vez. Ignore cabeçalhos, categorias, emojis, formatos (HD/4K/Dublado) e informações que não sejam títulos.",
        }],
      },
      contents: [{ role: "user", parts: [{ text: `Extraia todos os títulos do template abaixo:\n\n${text.slice(0, 12000)}` }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("Limite da API do Gemini excedido. Aguarde uns minutos.");
    if (res.status === 403 || res.status === 400) {
      throw new Error(
        "GEMINI_API_KEY inválida ou sem permissão. Verifique: (1) a chave está correta no .env da VPS (sem aspas/espaços), (2) foi criada em https://aistudio.google.com/apikey, (3) sua região tem acesso ao Gemini. Tente gerar uma nova chave se persistir.",
      );
    }
    throw new Error(`Falha na IA Gemini (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
}

async function extractTitlesWithAI(text: string): Promise<ExtractedItem[]> {
  const geminiKey = getServerEnv("GEMINI_API_KEY");
  const lovableKey = getServerEnv("LOVABLE_API_KEY");
  if (!geminiKey && !lovableKey) {
    throw new Error("Configure GEMINI_API_KEY (grátis em aistudio.google.com/apikey) ou LOVABLE_API_KEY no .env do servidor.");
  }

  const content = geminiKey
    ? await extractViaGemini(text, geminiKey)
    : await extractViaLovable(text, lovableKey!);

  try {
    const parsed = JSON.parse(content) as { items?: Array<{ title?: unknown; year?: unknown }> };
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return items
      .map((it) => ({
        title: String(it.title ?? "").trim(),
        year: typeof it.year === "number" ? it.year : null,
      }))
      .filter((it) => it.title.length > 1);
  } catch {
    return [];
  }
}

// ---- Matching ----
type MatchResult = {
  request_id: string;
  request_title: string;
  request_year: number | null;
  request_kind: string | null;
  status: string;
  user_name: string | null;
  whatsapp: string | null;
  matched_title: string;
  matched_year: number | null;
};

const OPEN_STATUSES = ["pending", "analyzing", "approved", "processing"];

type RequestRow = {
  id: string;
  user_id: string;
  title: string;
  year: number | null;
  request_kind: string | null;
  status: string;
};

async function findMatches(
  supabase: unknown,
  items: ExtractedItem[],
): Promise<MatchResult[]> {
  const sb = supabase as {
    from: (t: string) => {
      select: (c: string) => {
        in: (col: string, values: string[]) => Promise<{ data: RequestRow[] | null }>;
      };
    };
  };
  const { data: reqs } = await sb
    .from("requests")
    .select("id, user_id, title, year, request_kind, status")
    .in("status", OPEN_STATUSES);
  if (!reqs?.length) return [];

  const userIds = Array.from(new Set(reqs.map((r) => r.user_id)));
  const sbProfs = supabase as {
    from: (t: string) => {
      select: (c: string) => {
        in: (col: string, values: string[]) => Promise<{
          data: Array<{ id: string; full_name: string | null; whatsapp: string | null }> | null;
        }>;
      };
    };
  };
  const { data: profs } = await sbProfs
    .from("profiles")
    .select("id, full_name, whatsapp")
    .in("id", userIds);
  const profMap = new Map((profs ?? []).map((p) => [p.id, p]));

  const normItems = items.map((it) => ({ ...it, norm: normalizeTitle(it.title) }));
  const matches: MatchResult[] = [];
  const seen = new Set<string>();

  for (const r of reqs) {
    const rn = normalizeTitle(r.title);
    if (!rn) continue;
    const hit = normItems.find((it) => {
      if (!it.norm) return false;
      if (it.norm === rn) {
        if (it.year && r.year && it.year !== r.year) return false;
        return true;
      }
      if (rn.length >= 5 && it.norm.length >= 5) {
        return it.norm.includes(rn) || rn.includes(it.norm);
      }
      return false;
    });
    if (hit && !seen.has(r.id)) {
      seen.add(r.id);
      const p = profMap.get(r.user_id);
      matches.push({
        request_id: r.id,
        request_title: r.title,
        request_year: r.year,
        request_kind: r.request_kind,
        status: r.status,
        user_name: p?.full_name ?? null,
        whatsapp: p?.whatsapp ?? null,
        matched_title: hit.title,
        matched_year: hit.year ?? null,
      });
    }
  }
  return matches;
}

const analyzeSchema = z.object({ template_text: z.string().min(1).max(30000) });

export const analyzeTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => analyzeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const items = await extractTitlesWithAI(data.template_text);
    const matches = await findMatches(context.supabase, items);
    // Log analysis history (applied/notified counts filled by applyMatches later).
    try {
      const { error: logErr } = await context.supabase.from("ai_analyses").insert({
        admin_user_id: context.userId,
        template_excerpt: data.template_text.slice(0, 500),
        extracted_count: items.length,
        matched_count: matches.length,
        applied_count: 0,
        notified_count: 0,
        auto_applied: false,
      });
      if (logErr) console.warn("[ai-match] log insert failed", logErr.message);
    } catch (err) {
      console.warn("[ai-match] log failed", err);
    }
    return { extracted: items, matches };
  });

export const listAiAnalyses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { data, error } = await context.supabase
      .from("ai_analyses")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });


// ---- Apply matches ----
const KIND_LABEL: Record<string, string> = {
  adicao: "Adição",
  atualizacao: "Atualização",
  conserto: "Conserto",
};

const applySchema = z.object({ request_ids: z.array(z.string().uuid()).min(1).max(500) });

export const applyMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => applySchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);

    const { data: reqs, error: fetchErr } = await context.supabase
      .from("requests")
      .select("id, user_id, title, status, request_kind, format")
      .in("id", data.request_ids);
    if (fetchErr) throw new Error(fetchErr.message);
    if (!reqs?.length) return { updated: 0, notified: 0 };

    const userIds = Array.from(new Set(reqs.map((r) => r.user_id as string)));
    const { data: profs } = await context.supabase
      .from("profiles")
      .select("id, full_name, whatsapp")
      .in("id", userIds);
    const profMap = new Map(
      (profs ?? []).map((p) => [
        p.id as string,
        { full_name: p.full_name as string | null, whatsapp: p.whatsapp as string | null },
      ]),
    );

    let updated = 0;
    let notified = 0;
    for (const r of reqs) {
      const kind = r.request_kind as string | null;
      const newStatus: "fixed" | "completed" = kind === "conserto" ? "fixed" : "completed";
      const { error: updErr } = await context.supabase
        .from("requests")
        .update({ status: newStatus, rejection_reason: null })
        .eq("id", r.id as string);
      if (updErr) continue;
      updated++;

      await context.supabase.from("request_logs").insert({
        request_id: r.id as string,
        changed_by: context.userId,
        from_status: r.status as "pending" | "analyzing" | "approved" | "processing",
        to_status: newStatus,
        note: "IA: marcado via template automático",
      });

      const p = profMap.get(r.user_id as string);
      try {
        await sendTemplate(
          p?.whatsapp ?? null,
          newStatus === "fixed" ? "fixed" : "completed",
          {
            cliente: p?.full_name ?? "Cliente",
            titulo: r.title as string,
            tipo: KIND_LABEL[kind ?? ""] ?? "",
            formato: (r.format as string | null) ?? "—",
            motivo: "—",
          },
          { supabase: context.supabase as never },
        );
        notified++;
      } catch (err) {
        console.error("[ai-match] notify failed", err);
      }
    }
    // Update most recent ai_analyses row with applied counts (best-effort).
    try {
      const { data: last } = await context.supabase
        .from("ai_analyses")
        .select("id")
        .eq("admin_user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last?.id) {
        await context.supabase
          .from("ai_analyses")
          .update({ applied_count: updated, notified_count: notified, auto_applied: true })
          .eq("id", last.id as string);
      }
    } catch (err) {
      console.warn("[ai-match] apply log failed", err);
    }
    return { updated, notified };
  });

