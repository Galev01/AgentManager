"use client";
import { useState } from "react";
import type { BackendKind } from "@openclaw-manager/types";
import { useCopilotSessions } from "@/hooks/use-copilot-sessions";
import { useCopilotUiState } from "@/hooks/use-copilot-ui-state";
import { CopilotEmptyState } from "./empty-state";
import { CopilotSessionView } from "./session-view";

export function CopilotPanel({ defaultBackend }: { defaultBackend: BackendKind }) {
  const { state, update } = useCopilotUiState();
  const { sessions, refetch } = useCopilotSessions();
  const [error, setError] = useState<string | null>(null);

  if (!state.open) return null;

  async function start({ backend, title }: { backend: BackendKind; title?: string }) {
    setError(null);
    const res = await fetch("/api/copilot/sessions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ backend, title }),
    });
    if (!res.ok) { setError(`create failed: ${res.status}`); return; }
    const meta = await res.json();
    update({ activeSessionId: meta.id });
    await refetch();
  }

  async function deleteActive() {
    if (!state.activeSessionId) return;
    await fetch(`/api/copilot/sessions/${encodeURIComponent(state.activeSessionId)}`, { method: "DELETE" });
    update({ activeSessionId: null });
    await refetch();
  }

  return (
    <div className="fixed bottom-20 right-4 z-50 flex h-[620px] w-[440px] flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 shadow-2xl md:w-[440px] max-md:inset-x-0 max-md:bottom-0 max-md:h-[80vh] max-md:w-auto max-md:rounded-none">
      {error && <div className="bg-red-950/40 p-2 text-xs text-red-300">{error}</div>}
      {state.activeSessionId
        ? <CopilotSessionView
            sessionId={state.activeSessionId}
            onClose={() => update({ open: false })}
            onDelete={() => void deleteActive()}
          />
        : <CopilotEmptyState
            defaultBackend={defaultBackend}
            recent={sessions ?? []}
            onStart={start}
            onPickSession={(id) => update({ activeSessionId: id })}
          />}
    </div>
  );
}
