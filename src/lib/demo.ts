import { and, eq, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

/** The seed script stores sample documents under this account; guests get a private copy. */
export const DEMO_TEMPLATE_EMAIL = "demo-template@docmind.local";
const GUEST_TTL_HOURS = 48;

/**
 * Creates a throwaway guest account with its own copy of the sample documents.
 * Embeddings are copied in SQL, so starting a demo costs nothing in OpenAI calls.
 */
export async function createGuestWithDemoData() {
  const db = getDb();

  // Housekeeping: remove guest accounts older than 48h (cascades to their data).
  await db
    .delete(schema.users)
    .where(
      and(
        eq(schema.users.isGuest, true),
        lt(schema.users.createdAt, new Date(Date.now() - GUEST_TTL_HOURS * 3600_000)),
      ),
    );

  const id = crypto.randomUUID();
  const [guest] = await db
    .insert(schema.users)
    .values({
      email: `guest-${id}@docmind.local`,
      name: "Guest",
      passwordHash: await hashPassword(crypto.randomUUID()),
      isGuest: true,
    })
    .returning();

  const [workspace] = await db
    .insert(schema.workspaces)
    .values({ userId: guest.id, name: "Demo workspace" })
    .returning();

  const [template] = await db
    .select({ workspaceId: schema.workspaces.id })
    .from(schema.workspaces)
    .innerJoin(schema.users, eq(schema.users.id, schema.workspaces.userId))
    .where(eq(schema.users.email, DEMO_TEMPLATE_EMAIL))
    .limit(1);

  if (template) {
    const templateDocs = await db
      .select()
      .from(schema.documents)
      .where(and(eq(schema.documents.workspaceId, template.workspaceId), eq(schema.documents.status, "ready")));

    for (const doc of templateDocs) {
      const [copy] = await db
        .insert(schema.documents)
        .values({
          workspaceId: workspace.id,
          name: doc.name,
          mimeType: doc.mimeType,
          pages: doc.pages,
          chunkCount: doc.chunkCount,
          status: "ready",
        })
        .returning();
      await db.execute(sql`
        INSERT INTO chunks (document_id, workspace_id, chunk_index, page, content, embedding)
        SELECT ${copy.id}, ${workspace.id}, chunk_index, page, content, embedding
        FROM chunks WHERE document_id = ${doc.id}
      `);
    }
  }

  return guest;
}
