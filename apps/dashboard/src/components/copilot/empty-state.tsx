"use client";
import { useState } from "react";
import type { BackendKind, CopilotSessionMeta } from "@openclaw-manager/types";

export function CopilotEmptyState({
  defaultBackend, recent, onStart, onPickSession,
}: {
  defaultBackend: BackendKind;
  recent: CopilotSessionMeta[];
  onStart: (input: { backend: BackendKind; title?: string }) => Promise<void>;
  onPickSession: (id: string) => void;
}) {
  const [backend, setBackend] = useState<BackendKind>(defaultBackend);
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true); setError(null);
    try { await onStart({ backend, title: title.trim() || undefined }); }
    catch (e) { setError(e instanceof Error ? e.message : "failed"); }
    finally { setPending(false); }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="space-y-2">
        <div className="text-sm font-medium text-neutral-100">New chat</div>
        <div className="flex flex-col gap-2 text-sm text-neutral-300">
          <label className="flex items-center gap-2">
            <input type="radio" name="backend" value="openclaw"
                   checked={backend === "openclaw"} onChange={() => setBackend("openclaw")} />
            OpenClaw
          </label>
          <label className="flex items-center gap-2 text-neutral-500" title="available in next phase">
            <input type="radio" name="backend" value="hermes"
                   checked={backend === "hermes"} onChange={() => setBackend("hermes")}
                   disabled />
            Hermes (coming soon)
          </label>
        </div>
        <input
          type="text"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm text-neutral-100"
        />
        <button
          onClick={start}
          disabled={pending || backend === "hermes"}
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Starting…" : "Start"}
        </button>
        {error && <div className="text-xs text-red-400">{error}</div>}
      </div>

      {recent.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Recent</div>
          <div className="space-y-1">
            {recent.slice(0, 5).map((s) => (
              <button key={s.id}
                onClick={() => onPickSession(s.id)}
                className="block w-full rounded border border-neutral-800 p-2 text-left text-sm text-neutral-200 hover:bg-neutral-900"
              >
                <div className="font-medium">{s.title ?? `Untitled — ${new Date(s.createdAt).toLocaleDateString()}`}</div>
                <div className="text-xs text-neutral-500">{s.backend} · {s.lastTurnAt ? new Date(s.lastTurnAt).toLocaleString() : "no turns yet"}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
