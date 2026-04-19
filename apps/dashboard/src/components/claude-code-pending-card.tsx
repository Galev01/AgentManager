"use client";
import { useState } from "react";
import type { ClaudeCodePendingItem } from "@openclaw-manager/types";

export function ClaudeCodePendingCard({
  pending,
  onResolved,
}: {
  pending: ClaudeCodePendingItem;
  onResolved: (id: string) => void;
}) {
  const [mode, setMode] = useState<"idle" | "edit" | "replace">("idle");
  const [text, setText] = useState(pending.draft);
  const [submitting, setSubmitting] = useState(false);

  async function resolve(action: "send-as-is" | "edit" | "replace" | "discard", body?: string) {
    setSubmitting(true);
    await fetch(`/api/claude-code/pending/${pending.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, text: body }),
    });
    setSubmitting(false);
    onResolved(pending.id);
  }

  return (
    <div className="rounded border border-yellow-500/40 bg-yellow-500/5 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-yellow-400">
        Pending draft — awaiting your decision
      </div>
      <div className="mb-3">
        <div className="mb-1 text-xs text-text-muted">Claude Code asked:</div>
        <div className="rounded bg-dark-lighter p-2 text-xs whitespace-pre-wrap">{pending.question}</div>
      </div>
      <div className="mb-3">
        <div className="mb-1 text-xs text-text-muted">OpenClaw drafted:</div>
        {mode === "idle" ? (
          <div className="rounded bg-dark-lighter p-2 text-xs whitespace-pre-wrap">{pending.draft}</div>
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded bg-dark-lighter p-2 text-xs"
            rows={6}
            placeholder={mode === "replace" ? "Write your own reply..." : "Edit the draft..."}
          />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {mode === "idle" && (
          <>
            <button
              disabled={submitting}
              onClick={() => resolve("send-as-is")}
              className="rounded bg-green-500/20 px-3 py-1.5 text-xs text-green-400 hover:bg-green-500/30 disabled:opacity-50"
            >
              Send as-is
            </button>
            <button
              disabled={submitting}
              onClick={() => setMode("edit")}
              className="rounded bg-blue-500/20 px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-500/30"
            >
              Edit
            </button>
            <button
              disabled={submitting}
              onClick={() => { setText(""); setMode("replace"); }}
              className="rounded bg-yellow-500/20 px-3 py-1.5 text-xs text-yellow-400 hover:bg-yellow-500/30"
            >
              Replace
            </button>
            <button
              disabled={submitting}
              onClick={() => resolve("discard")}
              className="rounded bg-red-500/20 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/30"
            >
              Discard
            </button>
          </>
        )}
        {mode !== "idle" && (
          <>
            <button
              disabled={submitting || !text.trim()}
              onClick={() => resolve(mode, text)}
              className="rounded bg-primary px-3 py-1.5 text-xs text-white disabled:opacity-50"
            >
              Send {mode}
            </button>
            <button
              onClick={() => { setMode("idle"); setText(pending.draft); }}
              className="rounded bg-dark-lighter px-3 py-1.5 text-xs"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
