import Link from "next/link";
import { getSessionUserId } from "@/lib/auth";
import { DemoButton } from "@/components/DemoButton";

const FEATURES = [
  {
    title: "Answers with sources",
    body: "Every claim links to the document and page it came from, so you can check it in one click.",
  },
  {
    title: "Streams in real time",
    body: "Answers appear word by word over Server-Sent Events. No waiting for a spinner.",
  },
  {
    title: "Agent with tools",
    body: "The model decides when to search, list files or summarize a whole document, and can search more than once.",
  },
  {
    title: "Private workspaces",
    body: "Group documents by project. Each workspace has its own files, chats and vector index.",
  },
];

const STEPS = [
  ["Upload", "PDF, Markdown or text up to 10 MB"],
  ["Index", "Split into chunks, embedded, stored in pgvector"],
  ["Ask", "Semantic search finds the right passages"],
  ["Answer", "GPT streams a cited answer"],
];

export default async function Home() {
  let signedIn = false;
  try {
    signedIn = Boolean(await getSessionUserId());
  } catch {
    signedIn = false;
  }

  return (
    <main className="min-h-screen">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <span className="text-lg font-bold tracking-tight">
          Doc<span className="text-emerald-500">Mind</span>
        </span>
        <div className="flex items-center gap-3 text-sm">
          <a
            href="https://github.com/Amitgoswami12/docmind"
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            GitHub
          </a>
          {signedIn ? (
            <Link href="/workspace" className="rounded-lg bg-zinc-900 px-3 py-1.5 font-medium text-white dark:bg-white dark:text-zinc-900">
              Open app
            </Link>
          ) : (
            <Link href="/login" className="rounded-lg border border-zinc-300 px-3 py-1.5 font-medium dark:border-zinc-700">
              Sign in
            </Link>
          )}
        </div>
      </nav>

      <section className="mx-auto max-w-5xl px-5 pb-16 pt-14 sm:pt-24">
        <p className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          RAG · Next.js · OpenAI · pgvector
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
          Ask your documents anything. <span className="text-emerald-500">Get answers you can check.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
          Upload PDFs and notes, ask questions in plain English, and get streamed answers that cite the exact page
          they came from.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <DemoButton />
          <Link
            href={signedIn ? "/workspace" : "/register"}
            className="rounded-xl border border-zinc-300 px-5 py-3 font-semibold transition hover:-translate-y-0.5 dark:border-zinc-700"
          >
            {signedIn ? "Open your workspace" : "Create a free account"}
          </Link>
        </div>
        <p className="mt-3 text-sm text-zinc-500">The demo needs no sign-up and comes with a sample employee handbook.</p>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16">
        <div className="grid gap-3 sm:grid-cols-4">
          {STEPS.map(([title, body], i) => (
            <div key={title} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="font-mono text-xs text-emerald-500">0{i + 1}</div>
              <div className="mt-1 font-semibold">{title}</div>
              <div className="mt-1 text-sm text-zinc-500">{body}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-24">
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-zinc-200 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
        Built by{" "}
        <a href="https://amitgoswami12.github.io" className="underline underline-offset-2">
          Amit Goswami
        </a>
      </footer>
    </main>
  );
}
