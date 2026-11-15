import type { Citation } from "@/lib/db/schema";

export type { Citation };

export type WorkspaceT = { id: string; name: string };

export type DocumentT = {
  id: string;
  name: string;
  pages: number;
  chunkCount: number;
  status: "processing" | "ready" | "failed";
  error: string | null;
  createdAt: string;
};

export type ChatT = { id: string; title: string; createdAt: string };

export type MessageT = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  latencyMs?: number | null;
  /** Client-only fields while an answer is streaming */
  streaming?: boolean;
  status?: string;
  error?: string;
};

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}
