"use client";

import React, { useEffect, useState } from "react";
import type { CCEnvelope, ClaudeCodePendingItem, ClaudeCodeSession } from "@openclaw-manager/types";

const BTN_BASE: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: 12,
  padding: "5px 10px",
  borderRadius: 4,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text)",
  cursor: "pointer",
};

const BTN_PRIMARY: React.CSSProperties = {
  ...BTN_BASE,
  background: "var(--accent)",
  color: "var(--accent-fg)",
  border: "1px solid var(--accent)",
  fontWeight: 500,
};

const BTN_GHOST: React.CSSProperties = {
  ...BTN_BASE,
  color: "var(--text-muted)",
};

export type CCEscalationCardProps = {
  session: ClaudeCodeSession;
  latestTurn: CCEnvelope;
  pending?: ClaudeCodePendingItem | null;
};

function ignoreKey(sessionId: string): string {
  return `cc-ignore-escalation-${sessionId}`;
}
function autoSwitchKey(sessionId: string): string {
  return `cc-autoswitch-${sessionId}`;
}

export function CCEscalationCard({ session, latestTurn, pending }: CCEscalationCardProps) {
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ignored, setIgnored] = useState(false);
  const [autoSwitch, setAutoSwitch] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIgnored(localStorage.getItem(ignoreKey(session.id)) === "1");
    setAutoSwitch(localStorage.getItem(autoSwitchKey(session.id)) === "1");
  }, [session.id]);

  const shouldShow =
    !ignored &&
    latestTurn.intent === "decide" &&
    latestTurn.state === "blocked" &&
    latestTurn.author.kind === "ide";

  useEffect(() => {
    if (!shouldShow || !autoSwitch || session.mode === "manual") return;
    void fetch(`/api/claude-code/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "manual" }),
    });
  }, [shouldShow, autoSwitch, session.id, session.mode]);

  if (!shouldShow) return null;

  async function takeOver() {
    setSubmitting(true);
    await fetch(`/api/claude-code/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "manual" }),
    });
    setSubmitting(false);
  }

  async function sendReply() {
    if (!draft.trim() || !pending) return;
    setSubmitting(true);
    await fetch(`/api/claude-code/pending/${pending.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "replace", text: draft.trim() }),
    });
    setSubmitting(false);
    setReplying(false);
    setDraft("");
  }

  function ignore() {
    if (typeof window !== "undefined") localStorage.setItem(ignoreKey(session.id), "1");
    setIgnored(true);
  }

  function toggleAutoSwitch(next: boolean) {
    if (typeof window !== "undefined") {
      localStorage.setItem(autoSwitchKey(session.id), next ? "1" : "0");
    }
    setAutoSwitch(next);
  }

  return (
    <div
      style={{
        borderRadius: 6,
        border: "1px solid var(--accent)",
        background: "var(--accent-dim)",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono, JetBrains Mono), monospace",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--accent)",
        }}
      >
        Decision needed
      </div>
      <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.45 }}>
        {latestTurn.message}
      </div>
      {replying ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            placeholder="Your verdict…"
            style={{
              fontFamily: "var(--font-mono, JetBrains Mono), monospace",
              fontSize: 12,
              padding: 8,
              borderRadius: 4,
              border: "1px solid var(--border)",
              background: "var(--panel)",
              color: "var(--text)",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              disabled={submitting || !draft.trim() || !pending}
              onClick={sendReply}
              style={{ ...BTN_PRIMARY, opacity: submitting || !draft.trim() || !pending ? 0.6 : 1 }}
            >
              Send verdict
            </button>
            <button
              type="button"
              onClick={() => {
                setReplying(false);
                setDraft("");
              }}
              style={BTN_GHOST}
            >
              Cancel
            </button>
          </div>
          {!pending ? (
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              No pending draft yet — flip to manual first, or wait for the next turn.
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button type="button" disabled={submitting} onClick={takeOver} style={BTN_PRIMARY}>
            Take over
          </button>
          <button type="button" onClick={() => setReplying(true)} style={BTN_BASE}>
            Reply in place
          </button>
          <button type="button" onClick={ignore} style={BTN_GHOST}>
            Ignore rule
          </button>
        </div>
      )}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          fontFamily: "var(--font-mono, JetBrains Mono), monospace",
          color: "var(--text-muted)",
          paddingTop: 4,
        }}
      >
        <input
          type="checkbox"
          checked={autoSwitch}
          onChange={(e) => toggleAutoSwitch(e.target.checked)}
        />
        Auto-switch to manual on decision-block
      </label>
    </div>
  );
}
