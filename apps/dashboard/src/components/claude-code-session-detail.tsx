"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ClaudeCodeSession,
  ClaudeCodeTranscriptEvent,
  ClaudeCodePendingItem,
} from "@openclaw-manager/types";
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

  // Live updates via existing ws
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

  return (
    <div className="grid grid-cols-[1fr_320px] gap-6">
      <div
        ref={scrollRef}
        className="h-[calc(100vh-12rem)] overflow-y-auto rounded border border-dark-border bg-dark-card p-6"
      >
        {events.length === 0 && (
          <p className="text-center text-text-muted">No turns yet. Start a conversation from your IDE.</p>
        )}
        {events.map((e, i) => (
          <TranscriptBubble key={i} event={e} />
        ))}
      </div>
      <aside className="flex flex-col gap-4">
        <div className="rounded border border-dark-border bg-dark-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Mode</h3>
          <button
            onClick={toggleMode}
            className={`w-full rounded px-3 py-2 text-sm ${session.mode === "agent" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}
          >
            {session.mode === "agent" ? "● Agent — click to take over" : "○ Manual — click to release"}
          </button>
        </div>
        {pending.map((p) => (
          <ClaudeCodePendingCard key={p.id} pending={p} onResolved={(id) => setPending((prev) => prev.filter((x) => x.id !== id))} />
        ))}
        <div className="rounded border border-dark-border bg-dark-card p-4 text-xs text-text-muted">
          <div className="mb-2 font-semibold text-text-gray">Session</div>
          <div>id: <code>{session.id}</code></div>
          <div>ide: {session.ide}</div>
          <div>workspace: <code className="break-all">{session.workspace}</code></div>
          <div>created: {new Date(session.createdAt).toLocaleString()}</div>
          <div>openclaw session: <code>{session.openclawSessionId}</code></div>
        </div>
        {session.state === "active" && (
          <button
            onClick={endSession}
            className="rounded border border-red-500/40 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
          >
            End session
          </button>
        )}
      </aside>
    </div>
  );
}

function TranscriptBubble({ event }: { event: ClaudeCodeTranscriptEvent }) {
  if (event.kind === "ask") {
    return (
      <div className="mb-4 flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary/20 px-4 py-2 text-sm">
          <div className="mb-1 text-xs text-text-muted">Claude Code</div>
          <div className="whitespace-pre-wrap">{event.question}</div>
          {event.context && (
            <details className="mt-2 text-xs text-text-muted">
              <summary className="cursor-pointer">context</summary>
              <pre className="mt-1 overflow-x-auto">{JSON.stringify(event.context, null, 2)}</pre>
            </details>
          )}
        </div>
      </div>
    );
  }
  if (event.kind === "answer") {
    const isOperator = event.source === "operator";
    return (
      <div className="mb-4 flex justify-start">
        <div
          className={`max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-2 text-sm ${isOperator ? "bg-yellow-500/15" : "bg-dark-lighter"}`}
        >
          <div className="mb-1 text-xs text-text-muted">
            {isOperator ? `Operator (${event.action})` : "OpenClaw"}
          </div>
          <div className="whitespace-pre-wrap">{event.answer}</div>
        </div>
      </div>
    );
  }
  if (event.kind === "discarded") {
    return <div className="mb-2 text-center text-xs text-red-400">— operator discarded reply —</div>;
  }
  if (event.kind === "timeout") {
    return <div className="mb-2 text-center text-xs text-orange-400">— operator timeout —</div>;
  }
  if (event.kind === "mode_change") {
    return (
      <div className="mb-2 text-center text-xs text-text-muted">
        — mode: {event.from} → {event.to} —
      </div>
    );
  }
  if (event.kind === "ended") {
    return <div className="mb-2 text-center text-xs text-text-muted">— session ended —</div>;
  }
  return null;
}
