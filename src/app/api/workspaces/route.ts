import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { handler, requireUser } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

export const GET = handler(async () => {
  const user = await requireUser();
  const rows = await getDb()
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.userId, user.id))
    .orderBy(asc(schema.workspaces.createdAt));
  return NextResponse.json({ workspaces: rows });
});

const body = z.object({ name: z.string().trim().min(1, "Name is required").max(60) });

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const { name } = body.parse(await req.json());
  const [ws] = await getDb().insert(schema.workspaces).values({ userId: user.id, name }).returning();
  return NextResponse.json({ workspace: ws }, { status: 201 });
});
