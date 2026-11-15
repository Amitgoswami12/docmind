import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { HttpError, handler, requireUser } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const db = getDb();
  const [doc] = await db
    .select({ id: schema.documents.id })
    .from(schema.documents)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.documents.workspaceId))
    .where(and(eq(schema.documents.id, id), eq(schema.workspaces.userId, user.id)))
    .limit(1);
  if (!doc) throw new HttpError(404, "Document not found");
  await db.delete(schema.documents).where(eq(schema.documents.id, id));
  return NextResponse.json({ ok: true });
});
