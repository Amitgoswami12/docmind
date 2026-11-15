"use client";

import ReactMarkdown from "react-markdown";
import type { Citation } from "./types";

/** Turns "[1]" / "[1, 3]" markers into links the Markdown renderer shows as clickable chips. */
function linkCitations(text: string) {
  return text.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (_, nums: string) =>
    nums
      .split(",")
      .map((n) => `[${n.trim()}](#cite-${n.trim()})`)
      .join(""),
  );
}

export function Answer({
  content,
  citations,
  streaming,
  onCite,
}: {
  content: string;
  citations: Citation[];
  streaming?: boolean;
  onCite: (c: Citation) => void;
}) {
  const byN = new Map(citations.map((c) => [c.n, c]));
  return (
    <div className={`prose-answer text-[15px] ${streaming ? "cursor-blink" : ""}`}>
      <ReactMarkdown
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith("#cite-")) {
              const n = Number(href.slice(6));
              const c = byN.get(n);
              return (
                <button
                  type="button"
                  onClick={() => c && onCite(c)}
                  title={c ? `${c.documentName}, page ${c.page}` : "Source"}
                  className="mx-0.5 inline-flex h-5 min-w-5 -translate-y-0.5 items-center justify-center rounded-md bg-emerald-500/15 px-1 font-mono text-[11px] font-semibold text-emerald-700 hover:bg-emerald-500/30 dark:text-emerald-300"
                >
                  {children}
                </button>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer" className="text-emerald-600 underline">
                {children}
              </a>
            );
          },
        }}
      >
        {linkCitations(content)}
      </ReactMarkdown>
    </div>
  );
}
