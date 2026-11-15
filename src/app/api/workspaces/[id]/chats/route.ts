import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { handler, requireUser, requireWorkspace } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await requireWorkspace(user.id, id);
  const rows = await getDb()
    .select()
    .from(schema.chats)
    .where(eq(schema.chats.workspaceId, id))
    .orderBy(desc(schema.chats.createdAt));
  return NextResponse.json({ chats: rows });
});

export const POST = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await requireWorkspace(user.id, id);
  const [chat] = await getDb().insert(schema.chats).values({ workspaceId: id }).returning();
  return NextResponse.json({ chat }, { status: 201 });
});
