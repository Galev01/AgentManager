"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { YoutubeChatMessageRow } from "@openclaw-manager/types";
import { Badge, Button, Card, EmptyState, LoadingRow } from "@/components/ui";

const POLL_INTERVAL_MS = 3000;

type Props = {
  videoId: string;
};

type ChatGetResponse = {
  ok: boolean;
  videoId: string;
  chatSessionId: string;
  messages: YoutubeChatMessageRow[];
};

function formatTimestamp(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function roleTone(role: YoutubeChatMessageRow["role"]) {
  if (role === "assistant") return "info" as const;
  if (role === "system") return "warn" as const;
  return "neutral" as const;
}

export function ChatTab({ videoId }: Props) {
  const [messages, setMessages] = useState<YoutubeChatMessageRow[]>([]);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef<boolean>(true);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/youtube/chat/${encodeURIComponent(videoId)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as ChatGetResponse;
      if (!mountedRef.current) return;
      setMessages(data.messages || []);
      setChatSessionId(data.chatSessionId || null);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load chat");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    mountedRef.current = true;
    void fetchMessages();
    return () => {
      mountedRef.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [fetchMessages]);

  useEffect(() => {
    if (loading) return;
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = setTimeout(() => {
      void fetchMessages();
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [messages, loading, fetchMessages]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const text = draft.trim();
      if (!text || submitting) return;
      setSubmitting(true);
      setError(null);

      const optimistic: YoutubeChatMessageRow = {
        id: `optimistic-${Date.now()}`,
        videoId,
        chatSessionId: chatSessionId || "pending",
        turnId: `optimistic-${Date.now()}`,
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
        status: "complete",
      };
      setMessages((prev) => [...prev, optimistic]);
      setDraft("");

      try {
        const res = await fetch(
          `/api/youtube/chat/${encodeURIComponent(videoId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: text,
              ...(chatSessionId ? { chatSessionId } : {}),
            }),
          }
        );
        if (!res.ok) {
          const body = await res.text();
          throw new Error(body || `HTTP ${res.status}`);
        }
        await fetchMessages();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message");
      } finally {
        setSubmitting(false);
      }
    },
    [draft, submitting, videoId, chatSessionId, fetchMessages]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {loading ? (
        <Card>
          <div style={{ padding: "14px 16px" }}>
            <LoadingRow label="Loading chat\u2026" />
          </div>
        </Card>
      ) : messages.length === 0 ? (
        <Card>
          <div style={{ padding: "14px 16px" }}>
            <EmptyState
              title="No messages yet"
              description="Ask a question below to start chatting about this video."
            />
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {messages.map((msg) => (
            <Card key={msg.id}>
              <div
                style={{
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    justifyContent: "space-between",
                  }}
                >
                  <Badge tone={roleTone(msg.role)}>{msg.role}</Badge>
                  <span
                    style={{
                      color: "var(--text-muted)",
                      fontSize: 12,
                    }}
                  >
                    {formatTimestamp(msg.createdAt)}
                    {msg.status !== "complete" ? ` \u00b7 ${msg.status}` : ""}
                  </span>
                </div>
                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: 13.5,
                    lineHeight: 1.5,
                  }}
                  dir="auto"
                >
                  {msg.content}
                </div>
                {msg.errorMessage ? (
                  <div
                    style={{
                      color: "var(--err, #f87171)",
                      fontSize: 12,
                    }}
                  >
                    {msg.errorMessage}
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <form
          onSubmit={handleSubmit}
          style={{
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about this video\u2026"
            rows={3}
            disabled={submitting}
            dir="auto"
            style={{
              width: "100%",
              resize: "vertical",
              fontFamily: "inherit",
              fontSize: 13.5,
              padding: 10,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void handleSubmit(e as unknown as FormEvent);
              }
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
              {error ? error : "Ctrl/Cmd + Enter to send"}
            </span>
            <Button
              type="submit"
              variant="primary"
              disabled={submitting || !draft.trim()}
            >
              {submitting ? "Sending\u2026" : "Send"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
