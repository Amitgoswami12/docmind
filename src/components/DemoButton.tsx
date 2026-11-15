"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DemoButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/demo", { method: "POST" });
    if (res.ok) {
      router.push("/workspace");
      router.refresh();
    } else {
      setError("Couldn't start the demo. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col">
      <button
        onClick={start}
        disabled={loading}
        className={`rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white transition hover:-translate-y-0.5 hover:bg-emerald-600 disabled:opacity-60 ${className}`}
      >
        {loading ? "Setting up your demo…" : "Try the live demo →"}
      </button>
      {error && <span className="mt-2 text-sm text-red-500">{error}</span>}
    </div>
  );
}
