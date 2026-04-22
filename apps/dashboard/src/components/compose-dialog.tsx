"use client";

import { useState, useRef, useEffect } from "react";
import { useTelemetry } from "@/lib/telemetry";

type Props = {
  conversationKey?: string;
  phone?: string;
  displayName?: string | null;
  onClose: () => void;
  onSent?: () => void;
};

export function ComposeDialog({
  conversationKey,
  phone: initialPhone,
  displayName,
  onClose,
  onSent,
}: Props) {
  const { trackOperation } = useTelemetry();
  const [phone, setPhone] = useState(initialPhone || "");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textRef.current?.focus();
  }, []);

  async function handleSend() {
    if (!phone.trim() || !text.trim()) return;
    setSending(true);
    setError(null);
    try {
      const trimmedText = text.trim();
      const doSend = async () => {
        const res = await fetch("/api/compose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationKey,
            phone: phone.trim(),
            text: trimmedText,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
      };
      if (conversationKey) {
        await trackOperation("conversations", "reply_sent", doSend, {
          conversationKey,
          length: trimmedText.length,
        });
      } else {
        await doSend();
      }
      onSent?.();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-6">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          Send Message{displayName ? ` to ${displayName}` : ""}
        </h2>

        <label className="mb-1 block text-sm text-zinc-400">Phone</label>
        <input
          type="text"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={!!initialPhone}
          className="mb-3 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 disabled:opacity-50"
          placeholder="972501234567@s.whatsapp.net"
        />

        <label className="mb-1 block text-sm text-zinc-400">Message</label>
        <textarea
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="mb-3 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          placeholder="Type your message..."
        />

        {error && (
          <p className="mb-3 text-sm text-red-400">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !phone.trim() || !text.trim()}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
