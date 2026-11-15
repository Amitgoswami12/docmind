import type { Citation } from "@/lib/db/schema";

/** Finds every [n] / [n, m] / [n][m] marker in an answer and returns the unique numbers in order of appearance. */
export function extractCitationNumbers(text: string): number[] {
  const seen = new Set<number>();
  for (const match of text.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    for (const n of match[1].split(",")) seen.add(Number(n.trim()));
  }
  return [...seen];
}

/** Keeps only the sources the answer actually cited, so the UI doesn't show irrelevant ones. */
export function citedSources(text: string, sources: Citation[]): Citation[] {
  const used = new Set(extractCitationNumbers(text));
  return sources.filter((s) => used.has(s.n));
}

/** Splits text into plain parts and citation markers, for rendering clickable chips. */
export function splitCitations(text: string): Array<{ type: "text"; value: string } | { type: "cite"; n: number[] }> {
  const parts: Array<{ type: "text"; value: string } | { type: "cite"; n: number[] }> = [];
  let last = 0;
  for (const m of text.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    if (m.index! > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    parts.push({ type: "cite", n: m[1].split(",").map((x) => Number(x.trim())) });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}
