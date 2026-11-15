import type { PageText } from "./chunk";

export const SUPPORTED_TYPES = {
  "application/pdf": "PDF",
  "text/plain": "Text",
  "text/markdown": "Markdown",
} as const;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export function detectMimeType(fileName: string, reported: string): string | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
  if (lower.endsWith(".txt")) return "text/plain";
  return reported in SUPPORTED_TYPES ? reported : null;
}

/** Extracts text page by page. Text and Markdown files are split into ~3,000-character "pages". */
export async function extractPages(data: Uint8Array, mimeType: string): Promise<PageText[]> {
  if (mimeType === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(data);
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [text];
    return pages.map((t, i) => ({ page: i + 1, text: t }));
  }

  const full = new TextDecoder("utf-8").decode(data);
  return paginateText(full);
}

export function paginateText(full: string, pageSize = 3000): PageText[] {
  const paragraphs = full.split(/\n{2,}/);
  const pages: PageText[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (current && (current + "\n\n" + p).length > pageSize) {
      pages.push({ page: pages.length + 1, text: current });
      current = p;
    } else {
      current = current ? current + "\n\n" + p : p;
    }
  }
  if (current.trim()) pages.push({ page: pages.length + 1, text: current });
  return pages;
}
