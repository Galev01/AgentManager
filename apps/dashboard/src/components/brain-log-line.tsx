"use client";

import { useState } from "react";

type Target = "facts" | "preferences" | "openThreads";

export function LogLineWithPromote({
  line,
  onPromote,
}: {
  line: string;
  onPromote: (target: Target) => Promise<{ unchanged: boolean }>;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function go(target: Target) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await onPromote(target);
      setMsg(r.unchanged ? `already in ${target}` : `added to ${target}`);
      setOpen(false);
    } catch (err: any) {
      setMsg(err.message || "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="group flex items-start gap-2 font-mono text-xs text-zinc-300 leading-relaxed">
      <span className="flex-1">{line}</span>
      <div className="relative shrink-0">
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={busy}
          className="rounded px-2 py-0.5 text-[11px] text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-700 disabled:opacity-50"
        >
          Promote ▾
        </button>
        {open && (
          <div className="absolute right-0 top-full z-10 mt-1 min-w-[140px] rounded border border-zinc-600 bg-zinc-800 shadow-lg">
            {(["facts", "preferences", "openThreads"] as const).map((t) => (
              <button key={t} onClick={() => go(t)} disabled={busy}
                className="block w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                {t}
              </button>
            ))}
          </div>
        )}
        {msg && <span className="ml-2 text-[11px] text-zinc-500">{msg}</span>}
      </div>
    </li>
  );
}
