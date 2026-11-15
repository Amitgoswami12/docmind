/**
 * Evaluates retrieval and answer quality against evals/questions.json
 * using the demo template workspace (run `npm run db:seed` first).
 *
 *   npm run eval
 *
 * Metrics:
 *  - Retrieval hit@6: the expected fact appears in one of the top 6 retrieved passages
 *  - Answer accuracy: the final answer contains every expected fact
 *  - Citation rate:   answerable questions whose answer cites at least one source
 *  - Refusal rate:    unanswerable questions where the model says it doesn't know
 *  - Latency:         average and p95 time per full answer
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { eq } from "drizzle-orm";

type Case = { question: string; expected: string[]; unanswerable?: boolean };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
const containsAll = (text: string, facts: string[]) => facts.every((f) => norm(text).includes(norm(f)));
const REFUSAL = /(not (mentioned|covered|included|specified|found|available)|doesn'?t (say|mention|contain|cover)|does not (say|mention|contain|cover)|no information|couldn'?t find|could not find|isn'?t in)/i;

async function main() {
  const { getDb, schema } = await import("../src/lib/db");
  const { DEMO_TEMPLATE_EMAIL } = await import("../src/lib/demo");
  const { retrieve } = await import("../src/lib/rag/retrieve");
  const { runAgent } = await import("../src/lib/ai/agent");

  const db = getDb();
  const [ws] = await db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .innerJoin(schema.users, eq(schema.users.id, schema.workspaces.userId))
    .where(eq(schema.users.email, DEMO_TEMPLATE_EMAIL))
    .limit(1);
  if (!ws) throw new Error("Demo workspace not found. Run `npm run db:seed` first.");

  const cases: Case[] = JSON.parse(await readFile("evals/questions.json", "utf8"));
  const rows: Array<Record<string, unknown>> = [];
  let hits = 0, correct = 0, cited = 0, answerable = 0, refused = 0, unanswerable = 0;
  const latencies: number[] = [];

  for (const c of cases) {
    const started = Date.now();
    const passages = await retrieve(ws.id, c.question, { topK: 6 });
    const result = await runAgent({ workspaceId: ws.id, history: [], question: c.question, emit: () => {} });
    const ms = Date.now() - started;
    latencies.push(ms);

    if (c.unanswerable) {
      unanswerable++;
      const ok = REFUSAL.test(result.answer);
      if (ok) refused++;
      rows.push({ question: c.question, type: "unanswerable", refused: ok, ms });
      console.log(`${ok ? "✔" : "✖"} [refuse] ${c.question}`);
      continue;
    }

    answerable++;
    const hit = passages.some((p) => containsAll(p.content, c.expected));
    const ok = containsAll(result.answer, c.expected);
    const hasCite = result.citations.length > 0;
    if (hit) hits++;
    if (ok) correct++;
    if (hasCite) cited++;
    rows.push({ question: c.question, retrievalHit: hit, correct: ok, cited: hasCite, ms });
    console.log(`${ok ? "✔" : "✖"} ${c.question}  (retrieval ${hit ? "hit" : "miss"}, ${ms} ms)`);
  }

  latencies.sort((a, b) => a - b);
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
  const summary = {
    date: new Date().toISOString(),
    questions: cases.length,
    retrievalHitAt6: pct(hits, answerable),
    answerAccuracy: pct(correct, answerable),
    citationRate: pct(cited, answerable),
    refusalRate: pct(refused, unanswerable),
    avgLatencyMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
    p95LatencyMs: latencies[Math.floor(latencies.length * 0.95) - 1] ?? latencies.at(-1),
  };

  console.log("\n=== Results ===");
  console.table(summary);
  await mkdir("evals/results", { recursive: true });
  await writeFile("evals/results/latest.json", JSON.stringify({ summary, rows }, null, 2));
  console.log("Saved evals/results/latest.json");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
