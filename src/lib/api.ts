import { NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { ZodError } from "zod";
import { getCurrentUser, type SessionUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wraps a route handler so thrown HttpErrors / validation errors become clean JSON responses. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
      }
      console.error(err);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Please sign in");
  return user;
}

/** Makes sure the workspace exists and belongs to this user. */
export async function requireWorkspace(userId: string, workspaceId: string) {
  const db = getDb();
  const [ws] = await db
    .select()
    .from(schema.workspaces)
    .where(and(eq(schema.workspaces.id, workspaceId), eq(schema.workspaces.userId, userId)))
    .limit(1);
  if (!ws) throw new HttpError(404, "Workspace not found");
  return ws;
}

export async function requireChat(userId: string, chatId: string) {
  const db = getDb();
  const [row] = await db
    .select({ chat: schema.chats, workspace: schema.workspaces })
    .from(schema.chats)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.chats.workspaceId))
    .where(and(eq(schema.chats.id, chatId), eq(schema.workspaces.userId, userId)))
    .limit(1);
  if (!row) throw new HttpError(404, "Chat not found");
  return row;
}

export const DAILY_MESSAGE_LIMIT = {
  guest: Number(process.env.GUEST_DAILY_MESSAGES ?? 20),
  user: Number(process.env.USER_DAILY_MESSAGES ?? 100),
};

/** Counts the user's questions in the last 24h so a public demo can't run up the OpenAI bill. */
export async function checkDailyLimit(user: SessionUser) {
  const db = getDb();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.messages)
    .innerJoin(schema.chats, eq(schema.chats.id, schema.messages.chatId))
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.chats.workspaceId))
    .where(
      and(
        eq(schema.workspaces.userId, user.id),
        eq(schema.messages.role, "user"),
        gte(schema.messages.createdAt, since),
      ),
    );
  const limit = user.isGuest ? DAILY_MESSAGE_LIMIT.guest : DAILY_MESSAGE_LIMIT.user;
  if (count >= limit) {
    throw new HttpError(429, `Daily limit of ${limit} questions reached. Try again tomorrow.`);
  }
}
