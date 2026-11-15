import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { handler, requireUser, requireWorkspace } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({ name: z.string().trim().min(1).max(60) });

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await requireWorkspace(user.id, id);
  const { name } = body.parse(await req.json());
  const [ws] = await getDb().update(schema.workspaces).set({ name }).where(eq(schema.workspaces.id, id)).returning();
  return NextResponse.json({ workspace: ws });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await requireWorkspace(user.id, id);
  await getDb().delete(schema.workspaces).where(eq(schema.workspaces.id, id));
  return NextResponse.json({ ok: true });
});
