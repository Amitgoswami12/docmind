import type { Citation } from "@/lib/db/schema";

/** Events the chat endpoint streams to the browser as Server-Sent Events. */
export type ChatEvent =
  | { type: "status"; text: string }
  | { type: "sources"; sources: Citation[] }
  | { type: "token"; text: string }
  | {
      type: "done";
      messageId: string;
      citations: Citation[];
      usage: { promptTokens: number; completionTokens: number };
      latencyMs: number;
    }
  | { type: "error"; message: string };

export function encodeEvent(event: ChatEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Incremental SSE parser: feed it raw text chunks as they arrive,
 * get back every complete event. Handles events split across network chunks.
 */
export function createSseParser() {
  let buffer = "";
  return (chunk: string): ChatEvent[] => {
    buffer += chunk;
    const events: ChatEvent[] = [];
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const data = raw
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      try {
        events.push(JSON.parse(data) as ChatEvent);
      } catch {
        // ignore malformed events
      }
    }
    return events;
  };
}
