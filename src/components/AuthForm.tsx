"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DemoButton } from "./DemoButton";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isRegister = mode === "register";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      router.push("/workspace");
      router.refresh();
      return;
    }
    const body = await res.json().catch(() => ({}));
    setError(body.error ?? "Something went wrong");
    setLoading(false);
  }

  const input =
    "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Doc<span className="text-emerald-500">Mind</span>
        </Link>
        <h1 className="mt-6 text-2xl font-bold">{isRegister ? "Create your account" : "Welcome back"}</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          {isRegister && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Name</span>
              <input name="name" required autoComplete="name" className={input} />
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Email</span>
            <input name="email" type="email" required autoComplete="email" className={input} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Password</span>
            <input
              name="password"
              type="password"
              required
              minLength={isRegister ? 8 : 1}
              autoComplete={isRegister ? "new-password" : "current-password"}
              className={input}
            />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            disabled={loading}
            className="w-full rounded-lg bg-zinc-900 py-2.5 font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
          >
            {loading ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-sm text-zinc-500">
          {isRegister ? "Already have an account? " : "New here? "}
          <Link href={isRegister ? "/login" : "/register"} className="font-medium text-emerald-600 underline-offset-2 hover:underline">
            {isRegister ? "Sign in" : "Create an account"}
          </Link>
        </p>
        <div className="my-6 flex items-center gap-3 text-xs text-zinc-400">
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          or
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <DemoButton className="w-full" />
      </div>
    </main>
  );
}
