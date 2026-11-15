import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { handler, requireChat, requireUser } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const { chat } = await requireChat(user.id, id);
  const rows = await getDb()
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.chatId, id))
    .orderBy(asc(schema.messages.createdAt));
  return NextResponse.json({ chat, messages: rows });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await requireChat(user.id, id);
  await getDb().delete(schema.chats).where(eq(schema.chats.id, id));
  return NextResponse.json({ ok: true });
});
