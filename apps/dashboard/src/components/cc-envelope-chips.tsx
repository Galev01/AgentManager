"use client";

import type { CCArtifact, CCEnvelope, CCIntent, CCState } from "@openclaw-manager/types";

const STATE_BG: Record<CCState, string> = {
  new: "var(--accent-dim)",
  in_progress: "var(--info-dim)",
  blocked: "var(--warn-dim)",
  review_ready: "var(--accent-dim)",
  done: "var(--ok-dim)",
  parked: "var(--panel)",
  timeout: "var(--err-dim)",
};

const STATE_FG: Record<CCState, string> = {
  new: "var(--accent)",
  in_progress: "var(--info)",
  blocked: "var(--warn)",
  review_ready: "var(--accent)",
  done: "var(--ok)",
  parked: "var(--text-muted)",
  timeout: "var(--err)",
};

const INTENT_LABEL: Record<CCIntent, string> = {
  decide: "decide",
  brainstorm: "brainstorm",
  plan: "plan",
  review: "review",
  research: "research",
  unblock: "unblock",
  handoff: "handoff",
  report: "report",
};

const LOUD_ARTIFACTS: ReadonlySet<CCArtifact> = new Set([
  "question",
  "decision",
  "patch",
  "review_notes",
  "spec",
]);

const ARTIFACT_ICON: Partial<Record<CCArtifact, string>> = {
  question: "?",
  decision: "✓",
  spec: "¶",
  plan: "☰",
  review_notes: "✎",
  patch: "±",
  summary: "·",
};

export type CCEnvelopeChipsProps = {
  envelope: CCEnvelope;
  prior?: Pick<CCEnvelope, "intent" | "state"> | null;
  transitioned?: boolean;
};

const chipBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "2px 6px",
  borderRadius: 4,
  fontFamily: "var(--font-mono, JetBrains Mono), monospace",
  fontSize: 11,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
};

export function CCEnvelopeChips({ envelope, prior, transitioned }: CCEnvelopeChipsProps) {
  const intentDim =
    !!prior && prior.intent === envelope.intent && prior.state === envelope.state;
  const stateDim = intentDim && !transitioned;
  const showArtifact = envelope.artifact !== "none";
  const artifactLoud = LOUD_ARTIFACTS.has(envelope.artifact);

  return (
    <div
      data-testid="cc-envelope-chips"
      style={{ display: "flex", alignItems: "center", gap: 6 }}
    >
      <span
        style={{
          ...chipBase,
          border: "1px solid var(--border)",
          color: "var(--text-muted)",
          opacity: intentDim ? 0.5 : 0.9,
        }}
      >
        {INTENT_LABEL[envelope.intent]}
      </span>
      <span
        style={{
          ...chipBase,
          background: STATE_BG[envelope.state],
          color: STATE_FG[envelope.state],
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          opacity: stateDim ? 0.5 : 1,
        }}
      >
        {envelope.state}
      </span>
      {showArtifact ? (
        <span
          style={{
            ...chipBase,
            border: "1px solid var(--border)",
            color: "var(--text)",
            opacity: artifactLoud ? 1 : 0.7,
          }}
          title={`artifact: ${envelope.artifact}`}
        >
          <span style={{ opacity: 0.7 }}>{ARTIFACT_ICON[envelope.artifact] ?? "•"}</span>
          {envelope.artifact}
        </span>
      ) : null}
    </div>
  );
}
