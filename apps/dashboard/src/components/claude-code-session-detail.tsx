"use client";
import { useEffect, useRef, useState } from "react";
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

export function ClaudeCodeSessionDetail({
  session,
  initialEvents,
  initialPending,
}: {
  session: ClaudeCodeSession;
  initialEvents: ClaudeCodeTranscriptEvent[];
  initialPending: ClaudeCodePendingItem[];
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

  const sessionKV = [
    { label: "id", value: <code>{session.id}</code> },
    { label: "ide", value: session.ide ?? "—" },
    { label: "workspace", value: <code style={{ wordBreak: "break-all" }}>{session.workspace}</code> },
    { label: "openclaw", value: <code>{session.openclawSessionId}</code> },
    { label: "created", value: new Date(session.createdAt).toLocaleString() },
  ];

  return (
    <>
      <PageHeader
        title={session.displayName}
        sub={
          <>
            Claude Code ·{" "}
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
        <Card style={{ display: "flex", flexDirection: "column", minHeight: 0, maxHeight: "calc(100vh - 220px)" }}>
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
              <TranscriptBubble key={i} event={e} />
            ))}
          </div>
        </Card>

        <aside style={{ display: "flex", flexDirection: "column", gap: "var(--row-gap)" }}>
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

function TranscriptBubble({ event }: { event: ClaudeCodeTranscriptEvent }) {
  if (event.kind === "ask") {
    return (
      <div className="msg us">
        <div className="msg-meta">Claude Code</div>
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
