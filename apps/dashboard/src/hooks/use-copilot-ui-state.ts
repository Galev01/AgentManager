"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "copilot-ui-state";

export type CopilotUiState = {
  open: boolean;
  activeSessionId: string | null;
};

const DEFAULT: CopilotUiState = { open: false, activeSessionId: null };

function read(): CopilotUiState {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as CopilotUiState;
    return {
      open: typeof parsed.open === "boolean" ? parsed.open : false,
      activeSessionId: typeof parsed.activeSessionId === "string" ? parsed.activeSessionId : null,
    };
  } catch { return DEFAULT; }
}

function write(s: CopilotUiState) {
  try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function useCopilotUiState() {
  const [state, setState] = useState<CopilotUiState>(DEFAULT);

  useEffect(() => { setState(read()); }, []);

  const update = useCallback((patch: Partial<CopilotUiState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      write(next);
      return next;
    });
  }, []);

  return { state, update };
}
