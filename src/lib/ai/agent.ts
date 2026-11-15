import type OpenAI from "openai";
import type { Citation } from "@/lib/db/schema";
import type { ChatEvent } from "@/lib/sse";
import { citedSources } from "@/lib/citations";
import { getOpenAI, CHAT_MODEL } from "./openai";
import { SYSTEM_PROMPT } from "./prompt";
import { SourceRegistry, TOOL_DEFINITIONS, runTool } from "./tools";

type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

const MAX_STEPS = 5;

const STATUS_TEXT: Record<string, string> = {
  search_documents: "Searching your documents…",
  list_documents: "Checking which documents you have…",
  summarize_document: "Reading the whole document…",
};

export type AgentResult = {
  answer: string;
  citations: Citation[];
  promptTokens: number;
  completionTokens: number;
};

/**
 * Agent loop with streaming:
 * 1. Stream the model's reply. If it asks for tools, run them and loop.
 * 2. When it answers in text, every token is forwarded to the browser as it arrives.
 */
export async function runAgent(params: {
  workspaceId: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  question: string;
  emit: (event: ChatEvent) => void;
  signal?: AbortSignal;
}): Promise<AgentResult> {
  const openai = getOpenAI();
  const sources = new SourceRegistry();
  const messages: Msg[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...params.history.slice(-10).map((m) => ({ role: m.role, content: m.content }) as Msg),
    { role: "user", content: params.question },
  ];

  let answer = "";
  let promptTokens = 0;
  let completionTokens = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    const isLastStep = step === MAX_STEPS - 1;
    const stream = await openai.chat.completions.create(
      {
        model: CHAT_MODEL,
        temperature: 0.2,
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: isLastStep ? "none" : "auto",
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal: params.signal },
    );

    const toolCalls: Array<{ id: string; name: string; args: string }> = [];
    let text = "";

    for await (const chunk of stream) {
      if (chunk.usage) {
        promptTokens += chunk.usage.prompt_tokens;
        completionTokens += chunk.usage.completion_tokens;
      }
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        text += delta.content;
        params.emit({ type: "token", text: delta.content });
      }
      for (const tc of delta.tool_calls ?? []) {
        const slot = (toolCalls[tc.index] ??= { id: "", name: "", args: "" });
        if (tc.id) slot.id = tc.id;
        if (tc.function?.name) slot.name += tc.function.name;
        if (tc.function?.arguments) slot.args += tc.function.arguments;
      }
    }

    const calls = toolCalls.filter(Boolean);
    if (calls.length === 0) {
      answer = text;
      break;
    }

    messages.push({
      role: "assistant",
      content: text || null,
      tool_calls: calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.args } })),
    });

    for (const call of calls) {
      params.emit({ type: "status", text: STATUS_TEXT[call.name] ?? `Running ${call.name}…` });
      let result: string;
      try {
        result = await runTool(call.name, call.args, { workspaceId: params.workspaceId, sources });
      } catch (err) {
        result = `Error: ${err instanceof Error ? err.message : "tool failed"}`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
    params.emit({ type: "sources", sources: sources.all() });
  }

  return {
    answer,
    citations: citedSources(answer, sources.all()),
    promptTokens,
    completionTokens,
  };
}
