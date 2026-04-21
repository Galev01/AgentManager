"use client";
import { useState } from "react";
import type { ClaudeCodePendingItem } from "@openclaw-manager/types";
import { Button } from "./ui";
import { CCEnvelopeChips } from "./cc-envelope-chips";
import { CCRefChips } from "./cc-ref-chips";

type Mode = "idle" | "edit" | "replace";

export function ClaudeCodePendingCard({
  pending,
  onResolved,
}: {
  pending: ClaudeCodePendingItem;
  onResolved: (id: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("idle");
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
    <div className="pending">
      <div className="pending-eyebrow">
        <span className="dot" />
        Pending draft — awaiting decision
      </div>

      <div className="pending-block">
        <div className="pending-label">Claude Code asked</div>
        {pending.envelope ? (
          <div style={{ marginBottom: 4 }}>
            <CCEnvelopeChips envelope={pending.envelope} />
          </div>
        ) : null}
        <div className="pending-text">{pending.question}</div>
        {pending.envelope?.refs?.length ? (
          <CCRefChips refs={pending.envelope.refs} />
        ) : null}
      </div>

      <div className="pending-block">
        <div className="pending-label">
          {mode === "replace" ? "Your reply" : "OpenClaw drafted"}
        </div>
        {pending.draftEnvelope && mode === "idle" ? (
          <div style={{ marginBottom: 4 }}>
            <CCEnvelopeChips envelope={pending.draftEnvelope} />
          </div>
        ) : null}
        {mode === "idle" ? (
          <div className="pending-text">{pending.draft}</div>
        ) : (
          <textarea
            className="pending-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={mode === "replace" ? "Write your own reply…" : "Edit the draft…"}
          />
        )}
      </div>

      <div className="pending-actions">
        {mode === "idle" && (
          <>
            <Button
              disabled={submitting}
              onClick={() => resolve("send-as-is")}
              className="btn-sm"
              style={{ color: "var(--ok)", background: "var(--ok-dim)", borderColor: "transparent" }}
            >
              Send as-is
            </Button>
            <Button disabled={submitting} onClick={() => setMode("edit")} className="btn-sm">
              Edit
            </Button>
            <Button
              disabled={submitting}
              onClick={() => {
                setText("");
                setMode("replace");
              }}
              className="btn-sm"
            >
              Replace
            </Button>
            <Button
              variant="danger"
              disabled={submitting}
              onClick={() => resolve("discard")}
              className="btn-sm"
            >
              Discard
            </Button>
          </>
        )}
        {mode !== "idle" && (
          <>
            <Button
              variant="primary"
              disabled={submitting || !text.trim()}
              onClick={() => resolve(mode, text)}
              className="btn-sm"
            >
              Send {mode}
            </Button>
            <Button
              onClick={() => {
                setMode("idle");
                setText(pending.draft);
              }}
              className="btn-sm"
            >
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
