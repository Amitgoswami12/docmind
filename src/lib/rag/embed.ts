import { getOpenAI, EMBEDDING_MODEL } from "@/lib/ai/openai";

const BATCH_SIZE = 96;

/** Embeds texts in batches, keeping the output in the same order as the input. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const openai = getOpenAI();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map((t) => t.replace(/\n/g, " "));
    const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: batch });
    const sorted = [...res.data].sort((a, b) => a.index - b.index);
    out.push(...sorted.map((d) => d.embedding));
  }
  return out;
}

export async function embedQuery(query: string): Promise<number[]> {
  const [v] = await embedTexts([query]);
  return v;
}
