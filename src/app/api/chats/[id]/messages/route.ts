import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { checkDailyLimit, handler, requireChat, requireUser } from "@/lib/api";
import { runAgent } from "@/lib/ai/agent";
import { getDb, schema } from "@/lib/db";
import { encodeEvent, type ChatEvent } from "@/lib/sse";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({ content: z.string().trim().min(1, "Type a question").max(2000) });

/** Sends a question and streams the answer back as Server-Sent Events. */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id: chatId } = await params;
  const { chat } = await requireChat(user.id, chatId);
  const { content } = body.parse(await req.json());
  await checkDailyLimit(user);

  const db = getDb();
  const history = await db
    .select({ role: schema.messages.role, content: schema.messages.content })
    .from(schema.messages)
    .where(eq(schema.messages.chatId, chatId))
    .orderBy(asc(schema.messages.createdAt));

  await db.insert(schema.messages).values({ chatId, role: "user", content });
  if (history.length === 0) {
    const title = content.length > 60 ? content.slice(0, 57) + "…" : content;
    await db.update(schema.chats).set({ title }).where(eq(schema.chats.id, chatId));
  }

  const encoder = new TextEncoder();
  const started = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: ChatEvent) => controller.enqueue(encoder.encode(encodeEvent(event)));
      try {
        const result = await runAgent({
          workspaceId: chat.workspaceId,
          history,
          question: content,
          emit,
          signal: req.signal,
        });
        const latencyMs = Date.now() - started;
        const [saved] = await db
          .insert(schema.messages)
          .values({
            chatId,
            role: "assistant",
            content: result.answer,
            citations: result.citations,
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            latencyMs,
          })
          .returning({ id: schema.messages.id });
        emit({
          type: "done",
          messageId: saved.id,
          citations: result.citations,
          usage: { promptTokens: result.promptTokens, completionTokens: result.completionTokens },
          latencyMs,
        });
      } catch (err) {
        if (!req.signal.aborted) {
          console.error(err);
          emit({ type: "error", message: "The assistant failed to answer. Please try again." });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
