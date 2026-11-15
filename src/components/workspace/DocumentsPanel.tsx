"use client";

import { useRef, useState } from "react";
import { api, type DocumentT } from "./types";

export function DocumentsPanel({
  workspaceId,
  documents,
  onChange,
}: {
  workspaceId: string;
  documents: DocumentT[];
  onChange: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  async function upload(file: File) {
    setError("");
    setUploading(file.name);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/workspaces/${workspaceId}/documents`, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error ?? body.document?.error ?? "Upload failed");
    } catch {
      setError("Upload failed. Check your connection.");
    } finally {
      setUploading(null);
      onChange();
    }
  }

  async function remove(doc: DocumentT) {
    if (!confirm(`Delete "${doc.name}"? Its passages will no longer be searched.`)) return;
    await api(`/api/documents/${doc.id}`, { method: "DELETE" }).catch(() => {});
    onChange();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Documents</h2>
        <p className="text-xs text-zinc-500">The assistant only answers from these files.</p>
      </div>

      <div className="p-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) upload(f);
          }}
          disabled={!!uploading}
          className={`w-full rounded-xl border-2 border-dashed px-3 py-5 text-center text-sm transition ${
            dragging ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-300 hover:border-emerald-500 dark:border-zinc-700"
          }`}
        >
          {uploading ? (
            <span className="text-zinc-500">
              Indexing <b className="text-zinc-800 dark:text-zinc-200">{uploading}</b>…
            </span>
          ) : (
            <>
              <span className="font-medium">Upload a file</span>
              <span className="block text-xs text-zinc-500">PDF, .md or .txt · up to 10 MB · or drop it here</span>
            </>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.md,.markdown,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </div>

      <ul className="flex-1 space-y-2 overflow-y-auto px-4 pb-4">
        {documents.length === 0 && <li className="text-sm text-zinc-500">No documents yet.</li>}
        {documents.map((d) => (
          <li key={d.id} className="group rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <div className="flex items-start justify-between gap-2">
              <span className="break-all font-medium">{d.name}</span>
              <button
                onClick={() => remove(d)}
                className="text-xs text-zinc-400 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                aria-label={`Delete ${d.name}`}
              >
                ✕
              </button>
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {d.status === "ready" && `${d.pages} pages · ${d.chunkCount} chunks`}
              {d.status === "processing" && "Processing…"}
              {d.status === "failed" && <span className="text-red-500">Failed: {d.error}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
