"use client";
import { useEffect, useRef, useState } from "react";
import { useSessionSnapshot } from "@/hooks/use-session-snapshot";
import { usePollingTurn } from "@/hooks/use-polling-turn";
import type { CopilotMessage } from "@openclaw-manager/types";

export function CopilotSessionView({ sessionId, onClose, onDelete }: { sessionId: string; onClose: () => void; onDelete: () => void }) {
  const { snapshot, refetch } = useSessionSnapshot(sessionId);
  const [pendingMsgId, setPendingMsgId] = useState<string | null>(null);
  const { response: pollResp } = usePollingTurn(sessionId, pendingMsgId);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // When polling lands done, refetch the snapshot to pull in the assistant message.
  useEffect(() => {
    if (pollResp && (pollResp.pending.state === "done" || pollResp.pending.state === "error" || pollResp.pending.state === "timeout")) {
      void refetch();
      setPendingMsgId(null);
    }
  }, [pollResp, refetch]);

  // Adopt server-side pending if present (after reload during a running turn).
  useEffect(() => {
    if (snapshot?.pending && !["done", "error", "timeout"].includes(snapshot.pending.state)) {
      setPendingMsgId(snapshot.pending.msg_id);
    }
  }, [snapshot]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [snapshot, pollResp]);

  async function send() {
    const text = input.trim();
    if (!text || submitting || pendingMsgId) return;
    setInput(""); setSubmitting(true); setError(null);
    try {
      const res = await fetch(`/api/copilot/sessions/${encodeURIComponent(sessionId)}/turn`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        const body = await res.text();
        if (res.status === 409) throw new Error("Another turn is in progress.");
        throw new Error(`Failed: ${body}`);
      }
      const body = await res.json();
      setPendingMsgId(body.msg_id);
      await refetch();
    } catch (e) { setError(e instanceof Error ? e.message : "send failed"); }
    finally { setSubmitting(false); }
  }

  if (!snapshot) return <div className="p-4 text-sm text-neutral-400">Loading…</div>;

  const messages = snapshot.messages;
  const isPending = pendingMsgId !== null || (snapshot.pending && !["done", "error", "timeout"].includes(snapshot.pending.state));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-neutral-800 p-3">
        <div className="flex-1">
          <div className="text-sm font-medium text-neutral-100">
            {snapshot.meta.title ?? `Untitled — ${new Date(snapshot.meta.createdAt).toLocaleDateString()}`}
          </div>
          <div className="text-xs text-neutral-500">{snapshot.meta.backend}</div>
        </div>
        <button onClick={onDelete} className="text-xs text-red-400 hover:underline">delete</button>
        <button onClick={onClose} className="text-xs text-neutral-400 hover:underline">close</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((m) => <MessageBubble key={m.msg_id} msg={m} />)}
        {isPending && <div className="text-xs italic text-neutral-500">…thinking</div>}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-neutral-800 p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          rows={2}
          placeholder="Type a message…"
          disabled={isPending ?? false}
          className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm text-neutral-100"
        />
        {error && <div className="mt-1 text-xs text-red-400">{error}</div>}
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: CopilotMessage }) {
  const isUser = msg.role === "user";
  const text = msg.events.find((e) => e.type === "text")?.text ?? "";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
        isUser ? "bg-emerald-800/40 text-emerald-100" : "bg-neutral-800 text-neutral-100"
      }`}>{text}</div>
    </div>
  );
}
