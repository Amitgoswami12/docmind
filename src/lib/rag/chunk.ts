export type PageText = { page: number; text: string };
export type Chunk = { page: number; index: number; content: string };

export type ChunkOptions = {
  /** Target chunk size in characters (~4 chars per token). */
  size?: number;
  /** Characters repeated between neighbouring chunks so ideas aren't cut in half. */
  overlap?: number;
};

const SEPARATORS = ["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " "];

/** Normalises whitespace while keeping paragraph breaks. */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Recursively splits text on the most natural separator available
 * (paragraph → line → sentence → word) until every piece fits `size`.
 */
export function splitRecursive(text: string, size: number, separators = SEPARATORS): string[] {
  if (text.length <= size) return [text];
  const [sep, ...rest] = separators;
  if (sep === undefined) {
    const out: string[] = [];
    for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
    return out;
  }
  const parts = text.split(sep);
  if (parts.length === 1) return splitRecursive(text, size, rest);

  const out: string[] = [];
  let current = "";
  for (let i = 0; i < parts.length; i++) {
    const piece = i < parts.length - 1 ? parts[i] + sep : parts[i];
    if ((current + piece).length <= size) {
      current += piece;
      continue;
    }
    if (current) out.push(current);
    if (piece.length > size) {
      out.push(...splitRecursive(piece, size, rest));
      current = "";
    } else {
      current = piece;
    }
  }
  if (current) out.push(current);
  return out;
}

/** Splits each page into overlapping chunks, remembering which page every chunk came from. */
export function chunkPages(pages: PageText[], opts: ChunkOptions = {}): Chunk[] {
  const size = opts.size ?? 1000;
  const overlap = Math.min(opts.overlap ?? 150, Math.floor(size / 2));
  const chunks: Chunk[] = [];

  for (const { page, text } of pages) {
    const clean = cleanText(text);
    if (!clean) continue;
    const pieces = splitRecursive(clean, size - overlap);
    for (let i = 0; i < pieces.length; i++) {
      let content = pieces[i];
      if (i > 0 && overlap > 0) {
        const tail = pieces[i - 1].slice(-overlap);
        const cut = tail.indexOf(" ");
        content = (cut >= 0 ? tail.slice(cut + 1) : tail) + content;
      }
      content = content.trim();
      if (content.length < 20) continue;
      chunks.push({ page, index: chunks.length, content });
    }
  }
  return chunks;
}
