// Resenhas: clientes dão nota (1-5) e comentário em conteúdos já adicionados.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type RpcFn = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export type ContentReview = {
  id: string;
  rating: number;
  body: string | null;
  author_initials: string;
  mine: boolean;
  created_at: string;
};

export type ReviewStat = {
  content_key: string;
  avg_rating: number;
  total: number;
  my_rating: number | null;
};

export type ReviewedContent = ReviewStat & {
  title: string;
  year: number | null;
  content_type: string;
  poster_path: string | null;
};

export const listContentReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ content_key: z.string().min(1).max(300) }).parse(d))
  .handler(async ({ data, context }): Promise<{ items: ContentReview[] }> => {
    const { data: rows, error } = await (context.supabase.rpc as never as RpcFn)("list_content_reviews", {
      _content_key: data.content_key,
    });
    if (error) throw new Error(error.message);
    return { items: (rows ?? []) as ContentReview[] };
  });

export const upsertContentReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        content_key: z.string().min(1).max(300),
        title: z.string().trim().min(1).max(200),
        year: z.number().int().nullable().optional(),
        content_type: z.enum(["movie", "tv"]).default("movie"),
        tmdb_id: z.number().int().nullable().optional(),
        poster_path: z.string().max(300).nullable().optional(),
        rating: z.number().int().min(1).max(5),
        body: z.string().trim().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await (context.supabase.rpc as never as RpcFn)("upsert_content_review", {
      _content_key: data.content_key,
      _title: data.title,
      _year: data.year ?? null,
      _content_type: data.content_type,
      _tmdb_id: data.tmdb_id ?? null,
      _poster_path: data.poster_path ?? null,
      _rating: data.rating,
      _body: data.body ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getReviewStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ keys: z.array(z.string().min(1)).max(200) }).parse(d))
  .handler(async ({ data, context }): Promise<{ items: ReviewStat[] }> => {
    if (!data.keys.length) return { items: [] };
    const { data: rows, error } = await (context.supabase.rpc as never as RpcFn)("content_review_stats", {
      _keys: data.keys,
    });
    if (error) throw new Error(error.message);
    return { items: (rows ?? []) as ReviewStat[] };
  });

export const listTopReviewed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).default(40) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ items: ReviewedContent[] }> => {
    const { data: rows, error } = await (context.supabase.rpc as never as RpcFn)("top_reviewed_content", {
      _limit: data.limit,
    });
    if (error) throw new Error(error.message);
    return { items: (rows ?? []) as ReviewedContent[] };
  });
