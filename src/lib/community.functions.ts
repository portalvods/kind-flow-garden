// Community feed: requests made by other clients (masked names) + upvotes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CommunityRequest = {
  request_id: string;
  title: string;
  year: number | null;
  content_type: string;
  request_kind: string;
  status: string;
  poster_path: string | null;
  author_initials: string;
  votes: number;
  voted: boolean;
  comments: number;
  created_at: string;
};

export const listCommunityRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(200).default(60) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ items: CommunityRequest[] }> => {
    const { data: rows, error } = await (context.supabase.rpc as never as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>)("community_requests", {
      _limit: data.limit,
    });
    if (error) throw new Error(error.message);
    return { items: (rows ?? []) as CommunityRequest[] };
  });

export const toggleRequestVote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ request_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ voted: boolean; votes: number }> => {
    const { data: res, error } = await (context.supabase.rpc as never as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>)("toggle_request_vote", {
      _request_id: data.request_id,
    });
    if (error) throw new Error(error.message);
    return res as { voted: boolean; votes: number };
  });

export type CommunityDuplicate = {
  request_id: string;
  title: string;
  year: number | null;
  request_kind: string;
  status: string;
  poster_path: string | null;
  author_initials: string;
  votes: number;
  voted: boolean;
  mine: boolean;
};

export const findCommunityDuplicate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(1).max(200),
        year: z.number().int().nullable().optional(),
        content_type: z.enum(["movie", "tv"]),
        request_kind: z.enum(["adicao", "atualizacao", "conserto"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ duplicate: CommunityDuplicate | null }> => {
    const { data: rows, error } = await (context.supabase.rpc as never as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>)("find_community_duplicate", {
      _title: data.title,
      _year: data.year ?? null,
      _content_type: data.content_type,
      _request_kind: data.request_kind,
    });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as CommunityDuplicate[];
    return { duplicate: list.length ? list[0] : null };
  });

export type RequestComment = {
  id: string;
  body: string;
  author_initials: string;
  avatar_url: string | null;
  mine: boolean;
  created_at: string;
};

type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

export const listRequestComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ request_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ items: RequestComment[] }> => {
    const { data: rows, error } = await (context.supabase.rpc as never as RpcFn)("list_request_comments", {
      _request_id: data.request_id,
    });
    if (error) throw new Error(error.message);
    return { items: (rows ?? []) as RequestComment[] };
  });

export const addRequestComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ request_id: z.string().uuid(), body: z.string().trim().min(2).max(500) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await (context.supabase.rpc as never as RpcFn)("add_request_comment", {
      _request_id: data.request_id,
      _body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteRequestComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await (context.supabase.rpc as never as RpcFn)("delete_request_comment", { _id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
