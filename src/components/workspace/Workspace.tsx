"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { createSseParser } from "@/lib/sse";
import { Answer } from "./Answer";
import { DocumentsPanel } from "./DocumentsPanel";
import { api, type ChatT, type Citation, type DocumentT, type MessageT, type WorkspaceT } from "./types";

const DEMO_QUESTIONS = [
  "How many days of annual leave do I get?",
  "Can I work from another country?",
  "Summarize the handbook in 5 points",
  "What do I need to do before my first day?",
];

export function Workspace({ user, dailyLimit }: { user: SessionUser; dailyLimit: number }) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceT[]>([]);
  const [wsId, setWsId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentT[]>([]);
  const [chats, setChats] = useState<ChatT[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageT[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<Citation | null>(null);
  const [panel, setPanel] = useState<"none" | "sidebar" | "docs">("none");
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ---- loaders -------------------------------------------------------------
  const loadDocs = useCallback(async (id: string) => {
    const { documents } = await api<{ documents: DocumentT[] }>(`/api/workspaces/${id}/documents`);
    setDocuments(documents);
  }, []);

  const loadChats = useCallback(async (id: string) => {
    const { chats } = await api<{ chats: ChatT[] }>(`/api/workspaces/${id}/chats`);
    setChats(chats);
    return chats;
  }, []);

  useEffect(() => {
    api<{ workspaces: WorkspaceT[] }>("/api/workspaces").then(({ workspaces }) => {
      setWorkspaces(workspaces);
      setWsId((cur) => cur ?? workspaces[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!wsId) return;
    setChatId(null);
    setMessages([]);
    loadDocs(wsId);
    loadChats(wsId).then((c) => setChatId(c[0]?.id ?? null));
  }, [wsId, loadDocs, loadChats]);

  useEffect(() => {
    if (!chatId || busy) return;
    api<{ messages: MessageT[] }>(`/api/chats/${chatId}`).then(({ messages }) => setMessages(messages));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // ---- actions -------------------------------------------------------------
  function patchLast(update: (m: MessageT) => MessageT) {
    setMessages((prev) => {
      const next = [...prev];
      next[next.length - 1] = update(next[next.length - 1]);
      return next;
    });
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || !wsId || busy) return;
    setBusy(true);
    setInput("");

    let id = chatId;
    if (!id) {
      const { chat } = await api<{ chat: ChatT }>(`/api/workspaces/${wsId}/chats`, { method: "POST" });
      id = chat.id;
      setChatId(id);
    }

    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", content: question, citations: [] },
      { id: `a-${Date.now()}`, role: "assistant", content: "", citations: [], streaming: true, status: "Thinking…" },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    let sources: Citation[] = [];

    try {
      const res = await fetch(`/api/chats/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: question }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parse = createSseParser();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const ev of parse(decoder.decode(value, { stream: true }))) {
          if (ev.type === "token") patchLast((m) => ({ ...m, content: m.content + ev.text, status: undefined }));
          // A new tool step means any earlier text was just "thinking out loud", so start the answer fresh.
          if (ev.type === "status") patchLast((m) => ({ ...m, content: "", status: ev.text }));
          if (ev.type === "sources") {
            sources = ev.sources;
            patchLast((m) => ({ ...m, citations: sources }));
          }
          if (ev.type === "done")
            patchLast((m) => ({
              ...m,
              id: ev.messageId,
              citations: ev.citations,
              latencyMs: ev.latencyMs,
              streaming: false,
              status: undefined,
            }));
          if (ev.type === "error") patchLast((m) => ({ ...m, streaming: false, status: undefined, error: ev.message }));
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        patchLast((m) => ({
          ...m,
          streaming: false,
          status: undefined,
          error: err instanceof Error ? err.message : "Something went wrong",
        }));
      }
    } finally {
      patchLast((m) => ({ ...m, streaming: false, status: undefined }));
      abortRef.current = null;
      setBusy(false);
      loadChats(wsId);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function newWorkspace() {
    const name = prompt("Name the new workspace", "New workspace");
    if (!name?.trim()) return;
    const { workspace } = await api<{ workspace: WorkspaceT }>("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setWorkspaces((w) => [...w, workspace]);
    setWsId(workspace.id);
  }

  async function deleteWorkspace() {
    if (!wsId || workspaces.length <= 1) return;
    const ws = workspaces.find((w) => w.id === wsId);
    if (!confirm(`Delete workspace "${ws?.name}" with all its documents and chats?`)) return;
    await api(`/api/workspaces/${wsId}`, { method: "DELETE" });
    const rest = workspaces.filter((w) => w.id !== wsId);
    setWorkspaces(rest);
    setWsId(rest[0]?.id ?? null);
  }

  async function deleteChat(id: string) {
    await api(`/api/chats/${id}`, { method: "DELETE" }).catch(() => {});
    if (id === chatId) {
      setChatId(null);
      setMessages([]);
    }
    if (wsId) loadChats(wsId);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const readyDocs = documents.filter((d) => d.status === "ready").length;

  // ---- UI ------------------------------------------------------------------
  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between p-4">
        <Link href="/" className="font-bold tracking-tight">
          Doc<span className="text-emerald-500">Mind</span>
        </Link>
        {user.isGuest && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600">Demo</span>
        )}
      </div>

      <div className="px-3">
        <label className="mb-1 block px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Workspace</label>
        <div className="flex gap-1">
          <select
            value={wsId ?? ""}
            onChange={(e) => setWsId(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <button onClick={newWorkspace} title="New workspace" className="rounded-lg border border-zinc-200 px-2 text-sm dark:border-zinc-800">
            +
          </button>
        </div>
        {workspaces.length > 1 && (
          <button onClick={deleteWorkspace} className="mt-1 px-1 text-[11px] text-zinc-400 hover:text-red-500">
            Delete this workspace
          </button>
        )}
      </div>

      <button
        onClick={() => {
          setChatId(null);
          setMessages([]);
          setPanel("none");
        }}
        className="mx-3 mt-4 rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
      >
        + New chat
      </button>

      <ul className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-2">
        {chats.map((c) => (
          <li key={c.id} className="group flex items-center">
            <button
              onClick={() => {
                setChatId(c.id);
                setPanel("none");
              }}
              className={`flex-1 truncate rounded-lg px-2 py-1.5 text-left text-sm ${
                c.id === chatId ? "bg-zinc-200 font-medium dark:bg-zinc-800" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
              }`}
            >
              {c.title}
            </button>
            <button
              onClick={() => deleteChat(c.id)}
              className="px-1 text-xs text-zinc-400 opacity-0 hover:text-red-500 group-hover:opacity-100"
              aria-label="Delete chat"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="border-t border-zinc-200 p-3 text-sm dark:border-zinc-800">
        <div className="truncate font-medium">{user.isGuest ? "Guest" : user.name}</div>
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>{dailyLimit} questions / day</span>
          <button onClick={logout} className="hover:text-zinc-900 dark:hover:text-zinc-100">
            {user.isGuest ? "Exit demo" : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Left sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-zinc-200 bg-zinc-50 md:block dark:border-zinc-800 dark:bg-zinc-950">
        {sidebar}
      </aside>

      {/* Main chat */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
          <button onClick={() => setPanel("sidebar")} className="text-sm md:hidden">
            ☰ Chats
          </button>
          <span className="hidden truncate text-sm text-zinc-500 md:block">
            {readyDocs} document{readyDocs === 1 ? "" : "s"} indexed
          </span>
          <button onClick={() => setPanel("docs")} className="text-sm lg:hidden">
            Documents ({documents.length})
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6">
            {messages.length === 0 && (
              <div className="pt-10 text-center">
                <h2 className="text-2xl font-bold">Ask your documents</h2>
                <p className="mt-2 text-sm text-zinc-500">
                  {readyDocs === 0
                    ? "Upload a PDF or text file to get started."
                    : "Answers cite the exact passages they come from. Click a number to see the source."}
                </p>
                {readyDocs > 0 && (
                  <div className="mx-auto mt-6 grid max-w-xl gap-2 sm:grid-cols-2">
                    {DEMO_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => send(q)}
                        className="rounded-xl border border-zinc-200 p-3 text-left text-sm hover:border-emerald-500 dark:border-zinc-800"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-6">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-zinc-900 px-4 py-2.5 text-[15px] text-white dark:bg-zinc-100 dark:text-zinc-900">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={m.id}>
                    {m.status && (
                      <div className="mb-2 flex items-center gap-2 text-sm text-zinc-500">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                        {m.status}
                      </div>
                    )}
                    {m.content && (
                      <Answer content={m.content} citations={m.citations} streaming={m.streaming} onCite={setSource} />
                    )}
                    {m.error && <p className="text-sm text-red-500">{m.error}</p>}
                    {!m.streaming && m.citations.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {m.citations.map((c) => (
                          <button
                            key={c.n}
                            onClick={() => setSource(c)}
                            className="rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:border-emerald-500 dark:border-zinc-800 dark:text-zinc-400"
                          >
                            <span className="font-mono font-semibold text-emerald-600">[{c.n}]</span> {c.documentName} · p.{c.page}
                          </button>
                        ))}
                      </div>
                    )}
                    {!m.streaming && m.latencyMs ? (
                      <div className="mt-1 text-[11px] text-zinc-400">Answered in {(m.latencyMs / 1000).toFixed(1)}s</div>
                    ) : null}
                  </div>
                ),
              )}
            </div>
            <div ref={bottomRef} />
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="border-t border-zinc-200 p-3 dark:border-zinc-800"
        >
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-zinc-300 bg-white p-2 focus-within:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder={readyDocs ? "Ask a question about your documents…" : "Upload a document first…"}
              className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none"
            />
            {busy ? (
              <button type="button" onClick={stop} className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700">
                Stop
              </button>
            ) : (
              <button
                disabled={!input.trim()}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Send
              </button>
            )}
          </div>
        </form>
      </main>

      {/* Right documents panel */}
      <aside className="hidden w-72 shrink-0 border-l border-zinc-200 lg:block dark:border-zinc-800">
        {wsId && <DocumentsPanel workspaceId={wsId} documents={documents} onChange={() => loadDocs(wsId)} />}
      </aside>

      {/* Mobile drawers */}
      {panel !== "none" && (
        <div className="fixed inset-0 z-30 flex" onClick={() => setPanel("none")}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            onClick={(e) => e.stopPropagation()}
            className={`relative h-full w-[85%] max-w-xs bg-white dark:bg-zinc-950 ${panel === "docs" ? "ml-auto" : ""}`}
          >
            {panel === "sidebar" ? sidebar : wsId && <DocumentsPanel workspaceId={wsId} documents={documents} onChange={() => loadDocs(wsId)} />}
          </div>
        </div>
      )}

      {/* Source viewer */}
      {source && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setSource(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-xs font-semibold text-emerald-600">Source [{source.n}]</div>
                <div className="font-semibold">{source.documentName}</div>
                <div className="text-xs text-zinc-500">
                  Page {source.page} · relevance {Math.round(source.score * 100)}%
                </div>
              </div>
              <button onClick={() => setSource(null)} className="text-zinc-400 hover:text-zinc-700" aria-label="Close">
                ✕
              </button>
            </div>
            <blockquote className="mt-4 max-h-80 overflow-y-auto whitespace-pre-wrap border-l-2 border-emerald-500 pl-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {source.snippet}
              {source.snippet.length >= 400 ? "…" : ""}
            </blockquote>
          </div>
        </div>
      )}
    </div>
  );
}
