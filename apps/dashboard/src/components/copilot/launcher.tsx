"use client";
import { useCopilotUiState } from "@/hooks/use-copilot-ui-state";
import { PermissionGate } from "@/components/permission-gate";
import { CopilotPanel } from "./panel";
import type { BackendKind } from "@openclaw-manager/types";

export function CopilotLauncher({ defaultBackend = "openclaw" as BackendKind }: { defaultBackend?: BackendKind }) {
  const { state, update } = useCopilotUiState();
  return (
    <PermissionGate perm="copilot.chat">
      <button
        onClick={() => update({ open: !state.open })}
        aria-label="Open Copilot"
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-700 text-white shadow-lg hover:bg-emerald-600"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
      </button>
      <CopilotPanel defaultBackend={defaultBackend} />
    </PermissionGate>
  );
}
