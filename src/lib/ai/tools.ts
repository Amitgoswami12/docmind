import { and, asc, eq } from "drizzle-orm";
import type OpenAI from "openai";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import type { Citation } from "@/lib/db/schema";
import { retrieve } from "@/lib/rag/retrieve";
import { getOpenAI, CHAT_MODEL } from "./openai";
import { formatSources } from "./prompt";

export const TOOL_DEFINITIONS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_documents",
      description:
        "Semantic search over the user's uploaded documents. Returns numbered passages to cite. Use focused queries; call again with other wording if needed.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to look for, phrased as a statement or question." },
          document_ids: {
            type: "array",
            items: { type: "string" },
            description: "Optional: only search these document IDs (from list_documents).",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_documents",
      description: "Lists the documents in the current workspace with their IDs, page counts and status.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "summarize_document",
      description: "Produces a structured summary of one whole document. Use for 'summarize X' or 'what is X about'.",
      parameters: {
        type: "object",
        properties: { document_id: { type: "string", description: "ID from list_documents." } },
        required: ["document_id"],
        additionalProperties: false,
      },
    },
  },
];

/** Shared state for one answer: every passage the agent saw gets a stable citation number. */
export class SourceRegistry {
  private byChunk = new Map<string, Citation>();

  add(chunk: { chunkId: string; documentId: string; documentName: string; page: number; content: string; score: number }) {
    const existing = this.byChunk.get(chunk.chunkId);
    if (existing) return existing;
    const citation: Citation = {
      n: this.byChunk.size + 1,
      chunkId: chunk.chunkId,
      documentId: chunk.documentId,
      documentName: chunk.documentName,
      page: chunk.page,
      snippet: chunk.content.slice(0, 400),
      score: Math.round(chunk.score * 1000) / 1000,
    };
    this.byChunk.set(chunk.chunkId, citation);
    return citation;
  }

  all(): Citation[] {
    return [...this.byChunk.values()];
  }
}

type ToolContext = { workspaceId: string; sources: SourceRegistry };

const searchArgs = z.object({ query: z.string().min(1), document_ids: z.array(z.string()).optional() });
const summarizeArgs = z.object({ document_id: z.string().min(1) });

export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<string> {
  const db = getDb();
  let args: unknown;
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return "Error: arguments were not valid JSON.";
  }

  if (name === "search_documents") {
    const { query, document_ids } = searchArgs.parse(args);
    const results = await retrieve(ctx.workspaceId, query, { topK: 6, documentIds: document_ids });
    const numbered = results.map((r) => ({ ...ctx.sources.add(r), content: r.content }));
    return formatSources(numbered);
  }

  if (name === "list_documents") {
    const docs = await db
      .select({
        id: schema.documents.id,
        name: schema.documents.name,
        pages: schema.documents.pages,
        status: schema.documents.status,
      })
      .from(schema.documents)
      .where(eq(schema.documents.workspaceId, ctx.workspaceId));
    if (docs.length === 0) return "The workspace has no documents yet.";
    return docs.map((d) => `- ${d.name} (id: ${d.id}, ${d.pages} pages, ${d.status})`).join("\n");
  }

  if (name === "summarize_document") {
    const { document_id } = summarizeArgs.parse(args);
    const [doc] = await db
      .select()
      .from(schema.documents)
      .where(and(eq(schema.documents.id, document_id), eq(schema.documents.workspaceId, ctx.workspaceId)))
      .limit(1);
    if (!doc) return "Error: no document with that ID in this workspace.";

    const rows = await db
      .select()
      .from(schema.chunks)
      .where(eq(schema.chunks.documentId, doc.id))
      .orderBy(asc(schema.chunks.chunkIndex));

    // Cap the text sent for summarising (~12k tokens), sampling evenly across the document.
    const budget = 48_000;
    const step = Math.max(1, Math.ceil(rows.reduce((n, r) => n + r.content.length, 0) / budget));
    const sampled = rows.filter((_, i) => i % step === 0);
    const cites = sampled.map((r) =>
      ctx.sources.add({
        chunkId: r.id,
        documentId: doc.id,
        documentName: doc.name,
        page: r.page,
        content: r.content,
        score: 1,
      }),
    );

    const res = await getOpenAI().chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Summarize the document passages below. Return: a one-sentence overview, 4-8 key points, and any important numbers, dates or rules. Keep the [n] source numbers next to each point.",
        },
        {
          role: "user",
          content: formatSources(sampled.map((r, i) => ({ ...cites[i], content: r.content }))),
        },
      ],
    });
    return res.choices[0]?.message?.content ?? "Could not summarize the document.";
  }

  return `Error: unknown tool "${name}".`;
}
