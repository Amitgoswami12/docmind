import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { HttpError, handler } from "@/lib/api";
import { createSession, hashPassword } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

const body = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const POST = handler(async (req: Request) => {
  const { name, email, password } = body.parse(await req.json());
  const db = getDb();

  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  if (existing) throw new HttpError(409, "An account with this email already exists");

  const [user] = await db
    .insert(schema.users)
    .values({ name, email, passwordHash: await hashPassword(password) })
    .returning({ id: schema.users.id });
  await db.insert(schema.workspaces).values({ userId: user.id, name: "My workspace" });

  await createSession(user.id);
  return NextResponse.json({ ok: true }, { status: 201 });
});
