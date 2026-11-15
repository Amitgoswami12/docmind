/**
 * Indexes the files in sample-docs/ into the demo template account.
 * Guests who click "Try the live demo" get a copy of these documents.
 *   npm run db:seed
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";

async function main() {
  const { getDb, schema } = await import("../src/lib/db");
  const { hashPassword } = await import("../src/lib/auth");
  const { DEMO_TEMPLATE_EMAIL } = await import("../src/lib/demo");
  const { ingestDocument } = await import("../src/lib/rag/ingest");
  const { detectMimeType } = await import("../src/lib/rag/parse");

  const db = getDb();

  // Start clean: removing the template user cascades to its workspace, documents and chunks.
  await db.delete(schema.users).where(eq(schema.users.email, DEMO_TEMPLATE_EMAIL));
  const [user] = await db
    .insert(schema.users)
    .values({
      email: DEMO_TEMPLATE_EMAIL,
      name: "Demo template",
      passwordHash: await hashPassword(crypto.randomUUID()),
      isGuest: true,
    })
    .returning();
  const [ws] = await db.insert(schema.workspaces).values({ userId: user.id, name: "Demo template" }).returning();

  const dir = path.join(process.cwd(), "sample-docs");
  for (const file of await readdir(dir)) {
    const mimeType = detectMimeType(file, "");
    if (!mimeType) continue;
    const data = new Uint8Array(await readFile(path.join(dir, file)));
    const doc = await ingestDocument({ workspaceId: ws.id, name: file, mimeType, data });
    console.log(`${doc.status === "ready" ? "✔" : "✖"} ${file}: ${doc.chunkCount} chunks ${doc.error ?? ""}`);
  }
  console.log("Demo data ready.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
