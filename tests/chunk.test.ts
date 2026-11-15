import { describe, expect, it } from "vitest";
import { chunkPages, cleanText, splitRecursive } from "@/lib/rag/chunk";
import { paginateText } from "@/lib/rag/parse";

describe("cleanText", () => {
  it("collapses spaces but keeps paragraph breaks", () => {
    expect(cleanText("a   b\r\n\r\n\r\n\tc")).toBe("a b\n\nc");
  });
});

describe("splitRecursive", () => {
  it("returns short text unchanged", () => {
    expect(splitRecursive("hello world", 100)).toEqual(["hello world"]);
  });

  it("never produces pieces longer than the limit", () => {
    const text = Array.from({ length: 50 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const pieces = splitRecursive(text, 120);
    expect(pieces.length).toBeGreaterThan(1);
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(120);
    expect(pieces.join("")).toBe(text);
  });

  it("prefers paragraph boundaries", () => {
    const pieces = splitRecursive("First paragraph.\n\nSecond paragraph.", 20);
    expect(pieces[0]).toBe("First paragraph.\n\n");
  });

  it("hard-splits a single very long word", () => {
    const pieces = splitRecursive("x".repeat(250), 100);
    expect(pieces.map((p) => p.length)).toEqual([100, 100, 50]);
  });
});

describe("chunkPages", () => {
  it("keeps the page number of every chunk", () => {
    const pages = [
      { page: 1, text: "Alpha ".repeat(300) },
      { page: 2, text: "Beta ".repeat(300) },
    ];
    const chunks = chunkPages(pages, { size: 400, overlap: 50 });
    expect(chunks.some((c) => c.page === 1)).toBe(true);
    expect(chunks.some((c) => c.page === 2)).toBe(true);
    expect(chunks.filter((c) => c.page === 1).every((c) => !c.content.includes("Beta"))).toBe(true);
  });

  it("numbers chunks consecutively", () => {
    const chunks = chunkPages([{ page: 1, text: "word ".repeat(1000) }], { size: 300 });
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  it("adds overlap between neighbouring chunks", () => {
    const text = Array.from({ length: 200 }, (_, i) => `w${i}`).join(" ");
    const [a, b] = chunkPages([{ page: 1, text }], { size: 200, overlap: 40 });
    const lastWordOfA = a.content.split(" ").at(-1)!;
    expect(b.content.includes(lastWordOfA)).toBe(true);
  });

  it("skips empty pages and tiny fragments", () => {
    expect(chunkPages([{ page: 1, text: "   " }, { page: 2, text: "ok" }])).toEqual([]);
  });
});

describe("paginateText", () => {
  it("groups paragraphs into pages of roughly the given size", () => {
    const text = Array.from({ length: 10 }, (_, i) => `Paragraph ${i} `.repeat(20)).join("\n\n");
    const pages = paginateText(text, 1000);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0].page).toBe(1);
    expect(pages.at(-1)!.page).toBe(pages.length);
  });
});
