import { and, cosineDistance, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { embedQuery } from "./embed";

export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  documentName: string;
  page: number;
  content: string;
  score: number;
};

export type RetrieveOptions = {
  topK?: number;
  minScore?: number;
  documentIds?: string[];
};

/** Semantic search: embeds the query and returns the closest chunks in one workspace (cosine similarity). */
export async function retrieve(
  workspaceId: string,
  query: string,
  opts: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  const db = getDb();
  const { chunks, documents } = schema;
  const topK = opts.topK ?? 6;
  const minScore = opts.minScore ?? 0.2;

  const queryEmbedding = await embedQuery(query);
  const similarity = sql<number>`1 - (${cosineDistance(chunks.embedding, queryEmbedding)})`;

  const filters = [eq(chunks.workspaceId, workspaceId), gt(similarity, minScore)];
  if (opts.documentIds?.length) filters.push(inArray(chunks.documentId, opts.documentIds));

  const rows = await db
    .select({
      chunkId: chunks.id,
      documentId: chunks.documentId,
      documentName: documents.name,
      page: chunks.page,
      content: chunks.content,
      score: similarity,
    })
    .from(chunks)
    .innerJoin(documents, eq(documents.id, chunks.documentId))
    .where(and(...filters))
    .orderBy(desc(similarity))
    .limit(topK);

  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}
