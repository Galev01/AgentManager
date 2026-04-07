"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function SessionChat({
  sessionId,
  status,
}: {
  sessionId: string;
  status: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isActive = status === "active";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || !isActive || sending) return;
    setInput("");
    setSending(true);
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    try {
      const res = await fetch(`/api/agent-sessions/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", message: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send message");
      }
      const data = await res.json();
      // Bridge may return { response: "..." } or just a string
      const reply =
        typeof data === "string"
          ? data
          : data?.response ?? data?.content ?? JSON.stringify(data);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleAction(action: string) {
    const confirmMessages: Record<string, string> = {
      reset: "Reset this session? This will clear the conversation history.",
      abort: "Abort this session?",
      compact: "Compact this session's memory?",
      delete: "Delete this session permanently? This cannot be undone.",
    };
    if (!confirm(confirmMessages[action] ?? `Perform "${action}"?`)) return;
    setActionLoading(action);
    setError(null);
    try {
      const method = action === "delete" ? "DELETE" : "POST";
      const body = method === "POST" ? JSON.stringify({ action }) : undefined;
      const res = await fetch(`/api/agent-sessions/${sessionId}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to ${action}`);
      }
      if (action === "delete") {
        router.push("/sessions");
      } else {
        // Reload the page to reflect updated status
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Error banner */}
      {error && (
        <div className="rounded border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-3 text-red-400 hover:text-red-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Chat area */}
      <div className="h-96 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-4 space-y-4">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center mt-16">
            {isActive
              ? "Send a message to start the conversation."
              : "This session is no longer active."}
          </p>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-blue-700 text-white"
                    : "bg-zinc-800 text-zinc-100 border border-zinc-700"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-zinc-400">
              <span className="animate-pulse">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={!isActive || sending}
          placeholder={
            isActive ? "Type a message… (Enter to send, Shift+Enter for newline)" : "Session is not active"
          }
          rows={3}
          className="flex-1 resize-none rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          onClick={handleSend}
          disabled={!isActive || sending || !input.trim()}
          className="self-end rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleAction("reset")}
          disabled={!!actionLoading}
          className="rounded border border-zinc-600 bg-zinc-800 px-4 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {actionLoading === "reset" ? "Resetting…" : "Reset"}
        </button>
        <button
          onClick={() => handleAction("abort")}
          disabled={!!actionLoading || !isActive}
          className="rounded border border-zinc-600 bg-zinc-800 px-4 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {actionLoading === "abort" ? "Aborting…" : "Abort"}
        </button>
        <button
          onClick={() => handleAction("compact")}
          disabled={!!actionLoading}
          className="rounded border border-zinc-600 bg-zinc-800 px-4 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {actionLoading === "compact" ? "Compacting…" : "Compact"}
        </button>
        <button
          onClick={() => handleAction("delete")}
          disabled={!!actionLoading}
          className="rounded border border-red-700 bg-red-900/30 px-4 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-900/50 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {actionLoading === "delete" ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}
