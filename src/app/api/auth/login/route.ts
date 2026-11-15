import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { HttpError, handler } from "@/lib/api";
import { createSession, verifyPassword } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

const body = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const POST = handler(async (req: Request) => {
  const { email, password } = body.parse(await req.json());
  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);

  // Same message for "no such user" and "wrong password", so emails can't be probed.
  if (!user || user.isGuest || !(await verifyPassword(password, user.passwordHash))) {
    throw new HttpError(401, "Wrong email or password");
  }
  await createSession(user.id);
  return NextResponse.json({ ok: true });
});
