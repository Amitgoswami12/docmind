import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { chunkPages } from "./chunk";
import { embedTexts } from "./embed";
import { extractPages } from "./parse";

const INSERT_BATCH = 200;

/**
 * Full ingestion pipeline for one uploaded file:
 * extract text → split into chunks → embed → store in pgvector.
 */
export async function ingestDocument(params: {
  workspaceId: string;
  name: string;
  mimeType: string;
  data: Uint8Array;
}) {
  const db = getDb();
  const [doc] = await db
    .insert(schema.documents)
    .values({ workspaceId: params.workspaceId, name: params.name, mimeType: params.mimeType })
    .returning();

  try {
    const pages = await extractPages(params.data, params.mimeType);
    const pieces = chunkPages(pages);
    if (pieces.length === 0) {
      throw new Error("No readable text found. Scanned PDFs (images only) aren't supported yet.");
    }

    const embeddings = await embedTexts(pieces.map((c) => c.content));
    const rows = pieces.map((c, i) => ({
      documentId: doc.id,
      workspaceId: params.workspaceId,
      chunkIndex: c.index,
      page: c.page,
      content: c.content,
      embedding: embeddings[i],
    }));
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      await db.insert(schema.chunks).values(rows.slice(i, i + INSERT_BATCH));
    }

    const [ready] = await db
      .update(schema.documents)
      .set({ status: "ready", pages: pages.length, chunkCount: rows.length })
      .where(eq(schema.documents.id, doc.id))
      .returning();
    return ready;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ingestion failed";
    const [failed] = await db
      .update(schema.documents)
      .set({ status: "failed", error: message })
      .where(eq(schema.documents.id, doc.id))
      .returning();
    return failed;
  }
}
