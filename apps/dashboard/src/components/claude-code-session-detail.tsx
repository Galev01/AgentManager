"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ClaudeCodeSession,
  ClaudeCodeTranscriptEvent,
  ClaudeCodePendingItem,
} from "@openclaw-manager/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  KV,
  PageHeader,
  SectionTitle,
} from "./ui";
import { ClaudeCodePendingCard } from "./claude-code-pending-card";
import { CCEnvelopeChips } from "./cc-envelope-chips";
import { CCRefChips } from "./cc-ref-chips";

type Intel = {
  openclawModel: string | null;
  openclawTokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheCreate: number;
  };
};

function truncate(s: string, n: number): string {
  const trimmed = s.replace(/\s+/g, " ").trim();
  if (trimmed.length <= n) return trimmed;
  return `${trimmed.slice(0, n - 1)}…`;
}

function deriveTitle(events: ClaudeCodeTranscriptEvent[], fallback: string): string {
  const firstAsk = events.find((e) => e.kind === "ask" && typeof e.question === "string");
  if (firstAsk?.question) return truncate(firstAsk.question, 80);
  return fallback;
}

function deriveSummary(events: ClaudeCodeTranscriptEvent[]): string {
  const asks = events.filter((e) => e.kind === "ask").length;
  const answers = events.filter((e) => e.kind === "answer").length;
  const firstAsk = events.find((e) => e.kind === "ask" && typeof e.question === "string");
  const lastAnswer = [...events].reverse().find(
    (e) => e.kind === "answer" && typeof e.answer === "string",
  );

  const parts: string[] = [];
  if (firstAsk?.question) {
    parts.push(`Started: "${truncate(firstAsk.question, 100)}"`);
  }
  parts.push(`${asks} turn${asks === 1 ? "" : "s"} · ${answers} repl${answers === 1 ? "y" : "ies"}`);
  if (lastAnswer?.answer) {
    parts.push(`Latest reply: "${truncate(lastAnswer.answer, 100)}"`);
  }
  return parts.join(". ");
}

function formatTokens(n: number): string {
  if (n === 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

// Claude Code runs on this assistant's model. MCP doesn't report it to the bridge,
// so we surface the current assistant model (known from the Claude Code runtime).
const CLAUDE_CODE_MODEL = "claude-opus-4-7";

export function ClaudeCodeSessionDetail({
  session,
  initialEvents,
  initialPending,
  intel,
}: {
  session: ClaudeCodeSession;
  initialEvents: ClaudeCodeTranscriptEvent[];
  initialPending: ClaudeCodePendingItem[];
  intel: Intel;
}) {
  const router = useRouter();
  const [events, setEvents] = useState(initialEvents);
  const [pending, setPending] = useState(initialPending);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/ws`;
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(url);
    } catch {
      return;
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "claude_code_transcript_appended" && msg.payload?.sessionId === session.id) {
          setEvents((prev) => [...prev, msg.payload.event]);
        } else if (msg.type === "claude_code_pending_upserted" && msg.payload?.sessionId === session.id) {
          setPending((prev) => [...prev.filter((p) => p.id !== msg.payload.id), msg.payload]);
        } else if (msg.type === "claude_code_pending_resolved") {
          setPending((prev) => prev.filter((p) => p.id !== msg.payload?.id));
        } else if (msg.type === "claude_code_session_upserted") {
          router.refresh();
        }
      } catch {}
    };
    return () => ws?.close();
  }, [session.id, router]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [events]);

  async function toggleMode() {
    await fetch(`/api/claude-code/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: session.mode === "agent" ? "manual" : "agent" }),
    });
    router.refresh();
  }

  async function endSession() {
    await fetch(`/api/claude-code/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "ended" }),
    });
    router.refresh();
  }

  const title = useMemo(() => deriveTitle(events, session.displayName), [events, session.displayName]);
  const summary = useMemo(() => deriveSummary(events), [events]);

  const totalOpenclawTokens =
    intel.openclawTokens.input +
    intel.openclawTokens.output +
    intel.openclawTokens.cacheRead +
    intel.openclawTokens.cacheCreate;

  const intelItems = [
    {
      label: "OpenClaw model",
      value: intel.openclawModel ? (
        <code>{intel.openclawModel}</code>
      ) : (
        <span style={{ color: "var(--text-faint)" }}>unknown</span>
      ),
    },
    {
      label: "OpenClaw tokens",
      value:
        totalOpenclawTokens === 0 ? (
          <span style={{ color: "var(--text-faint)" }}>—</span>
        ) : (
          <span className="mono" style={{ fontSize: 11.5 }}>
            in {formatTokens(intel.openclawTokens.input)} · out{" "}
            {formatTokens(intel.openclawTokens.output)}
            {intel.openclawTokens.cacheRead > 0 &&
              ` · cache ${formatTokens(intel.openclawTokens.cacheRead)}`}
          </span>
        ),
    },
    {
      label: "Claude Code",
      value: <code>{CLAUDE_CODE_MODEL}</code>,
    },
    {
      label: "CC tokens",
      value: <span style={{ color: "var(--text-faint)" }}>not reported</span>,
    },
  ];

  const sessionKV = [
    { label: "id", value: <code>{session.id}</code> },
    { label: "ide", value: session.ide ?? "—" },
    {
      label: "workspace",
      value: <code style={{ wordBreak: "break-all" }}>{session.workspace}</code>,
    },
    { label: "openclaw", value: <code>{session.openclawSessionId}</code> },
    { label: "created", value: new Date(session.createdAt).toLocaleString() },
  ];

  return (
    <>
      <PageHeader
        title={title}
        sub={
          <>
            <span className="mono" style={{ color: "var(--text-faint)", fontSize: 11.5 }}>
              {session.displayName}
            </span>{" "}
            ·{" "}
            <Badge kind={session.state === "active" ? "acc" : "mute"}>{session.state}</Badge>{" "}
            · <span className="mono">{session.messageCount} msgs</span>
          </>
        }
        actions={
          session.state === "active" ? (
            <Button variant="danger" onClick={endSession}>
              End session
            </Button>
          ) : null
        }
      />

      <div className="detail-grid">
        <Card
          style={{
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            maxHeight: "calc(100vh - 220px)",
          }}
        >
          <SectionTitle right={<span className="mono">{events.length} events</span>}>
            Transcript
          </SectionTitle>
          <div className="thread" ref={scrollRef} style={{ flex: 1, minHeight: 0 }}>
            {events.length === 0 && (
              <EmptyState
                title="No turns yet"
                description="Start a conversation from your IDE."
              />
            )}
            {events.map((e, i) => (
              <TranscriptBubble
                key={i}
                event={e}
                prior={i > 0 ? events[i - 1] : null}
              />
            ))}
          </div>
        </Card>

        <aside style={{ display: "flex", flexDirection: "column", gap: "var(--row-gap)" }}>
          <Card>
            <SectionTitle>Summary</SectionTitle>
            <div style={{ padding: 14, fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55 }}>
              {events.length === 0 ? (
                <span style={{ color: "var(--text-faint)" }}>No activity yet.</span>
              ) : (
                summary
              )}
            </div>
          </Card>

          <Card>
            <SectionTitle>Intel</SectionTitle>
            <div style={{ padding: 14 }}>
              <KV items={intelItems} />
            </div>
          </Card>

          <Card>
            <SectionTitle>Mode</SectionTitle>
            <div style={{ padding: 14 }}>
              <div className="mode-row">
                <button
                  type="button"
                  role="switch"
                  aria-checked={session.mode === "agent"}
                  className={`sw ${session.mode === "agent" ? "on" : ""}`}
                  onClick={toggleMode}
                  title="Toggle agent/manual"
                />
                <div style={{ flex: 1 }}>
                  <div className="mode-label">
                    {session.mode === "agent" ? "Agent" : "Manual"}
                  </div>
                  <div className="mode-hint">
                    {session.mode === "agent"
                      ? "OpenClaw replies automatically"
                      : "Operator moderates every reply"}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {pending.length >= 2 && (
            <SectionTitle right={<span className="mono">{pending.length}</span>}>
              Pending approvals
            </SectionTitle>
          )}
          {pending.map((p) => (
            <ClaudeCodePendingCard
              key={p.id}
              pending={p}
              onResolved={(id) => setPending((prev) => prev.filter((x) => x.id !== id))}
            />
          ))}

          <Card>
            <SectionTitle>Session</SectionTitle>
            <div style={{ padding: 14 }}>
              <KV items={sessionKV} />
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}

function TranscriptBubble({
  event,
  prior,
}: {
  event: ClaudeCodeTranscriptEvent;
  prior: ClaudeCodeTranscriptEvent | null;
}) {
  const envelope = event.envelope ?? null;
  const priorEnv = prior?.envelope ?? null;
  const transitioned =
    !!envelope &&
    !!priorEnv &&
    (priorEnv.intent !== envelope.intent || priorEnv.state !== envelope.state);

  const chrome = envelope ? (
    <>
      <div style={{ marginBottom: 4 }}>
        <CCEnvelopeChips
          envelope={envelope}
          prior={priorEnv}
          transitioned={transitioned}
        />
      </div>
      {envelope.refs.length > 0 ? <CCRefChips refs={envelope.refs} /> : null}
    </>
  ) : null;

  if (event.kind === "ask") {
    return (
      <div className="msg us">
        <div className="msg-meta">Claude Code</div>
        {chrome}
        <div>{event.question}</div>
        {event.context && (
          <details>
            <summary>context</summary>
            <pre>{JSON.stringify(event.context, null, 2)}</pre>
          </details>
        )}
      </div>
    );
  }
  if (event.kind === "answer") {
    const isOperator = event.source === "operator";
    return (
      <div className={`msg ${isOperator ? "op" : "them"}`}>
        <div className="msg-meta">
          {isOperator ? `Operator (${event.action})` : "OpenClaw"}
        </div>
        {chrome}
        <div>{event.answer}</div>
      </div>
    );
  }
  if (event.kind === "discarded") {
    return (
      <div className="msg-sys err">
        <span className="line" />— operator discarded reply —<span className="line" />
      </div>
    );
  }
  if (event.kind === "timeout") {
    return (
      <div className="msg-sys warn">
        <span className="line" />— operator timeout —<span className="line" />
      </div>
    );
  }
  if (event.kind === "mode_change") {
    return (
      <div className="msg-sys">
        <span className="line" />— mode: {event.from} → {event.to} —<span className="line" />
      </div>
    );
  }
  if (event.kind === "ended") {
    return (
      <div className="msg-sys">
        <span className="line" />— session ended —<span className="line" />
      </div>
    );
  }
  return null;
}
