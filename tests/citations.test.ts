import { describe, expect, it } from "vitest";
import { citedSources, extractCitationNumbers, splitCitations } from "@/lib/citations";
import type { Citation } from "@/lib/db/schema";

const src = (n: number): Citation => ({
  n,
  chunkId: `c${n}`,
  documentId: "d",
  documentName: "doc.pdf",
  page: n,
  snippet: "",
  score: 0.9,
});

describe("extractCitationNumbers", () => {
  it("finds single, adjacent and comma-separated markers in order", () => {
    expect(extractCitationNumbers("A [2]. B [1][3]. C [4, 2].")).toEqual([2, 1, 3, 4]);
  });

  it("ignores Markdown links and non-numeric brackets", () => {
    expect(extractCitationNumbers("See [the docs](http://x) and [note]")).toEqual([]);
  });
});

describe("citedSources", () => {
  it("keeps only the sources the answer used", () => {
    const used = citedSources("Leave is 24 days [3].", [src(1), src(2), src(3)]);
    expect(used.map((s) => s.n)).toEqual([3]);
  });
});

describe("splitCitations", () => {
  it("splits text and markers for rendering", () => {
    expect(splitCitations("Hi [1] there [2, 3]")).toEqual([
      { type: "text", value: "Hi " },
      { type: "cite", n: [1] },
      { type: "text", value: " there " },
      { type: "cite", n: [2, 3] },
    ]);
  });
});
