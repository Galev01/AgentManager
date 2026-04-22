"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  YoutubeRebuildPart,
  YoutubeRebuildPartState,
  YoutubeRebuildPartStatus,
  YoutubeRebuildStatus,
} from "@openclaw-manager/types";
import { Badge, Button, Card } from "@/components/ui";

type Props = {
  videoId: string;
  url: string;
};

const ALL_PARTS: YoutubeRebuildPart[] = [
  "captions",
  "chunks",
  "summary",
  "highlights",
  "chapters",
  "chat-history",
];

const STATUS_POLL_MS = 1000;
/** How long the final per-part state stays visible after the rebuild ends. */
const RESULT_DISMISS_MS = 5000;

const STATUS_ICON: Record<YoutubeRebuildPartStatus, string> = {
  pending: "\u23f3", // hourglass
  running: "\ud83d\udd04", // anti-clockwise arrows
  ok: "\u2713",
  failed: "\u2717",
  skipped: "\u2212",
};

const STATUS_TONE: Record<
  YoutubeRebuildPartStatus,
  Parameters<typeof Badge>[0]["tone"]
> = {
  pending: "neutral",
  running: "info",
  ok: "ok",
  failed: "error",
  skipped: "neutral",
};

function PartRow({ part }: { part: YoutubeRebuildPartState }) {
  return (
    <span
      title={part.error || part.status}
      style={{ display: "inline-flex", gap: 4, alignItems: "center" }}
    >
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{part.part}</span>
      <Badge tone={STATUS_TONE[part.status]}>
        {STATUS_ICON[part.status]} {part.status}
      </Badge>
    </span>
  );
}

export function RebuildMenu({ videoId, url }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<YoutubeRebuildPart>>(
    () => new Set<YoutubeRebuildPart>()
  );
  const [submitting, setSubmitting] = useState(false);
  /** Live status from the bridge — replaces the old POST-result rendering.
   *  null = idle (no rebuild in flight or recently finished). */
  const [status, setStatus] = useState<YoutubeRebuildStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Stop any in-flight timers on unmount.
  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const togglePart = useCallback((part: YoutubeRebuildPart) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(part)) next.delete(part);
      else next.add(part);
      return next;
    });
  }, []);

  /** Polls the status endpoint until the rebuild ends, then schedules the
   *  final state to fade away after RESULT_DISMISS_MS. */
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/youtube/rebuild/${encodeURIComponent(videoId)}/status`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const body = (await res.json()) as {
          status: YoutubeRebuildStatus | null;
        };
        setStatus(body.status);
        if (body.status && body.status.active) {
          // Still running — keep polling.
          pollTimer.current = setTimeout(() => void pollStatus(), STATUS_POLL_MS);
          return;
        }
        if (body.status && !body.status.active) {
          // Finished — keep showing the final state for a beat, then drop it.
          if (dismissTimer.current) clearTimeout(dismissTimer.current);
          dismissTimer.current = setTimeout(() => setStatus(null), RESULT_DISMISS_MS);
          return;
        }
        // status === null: bridge has no record (retention expired or fresh
        // process). Stop polling.
        return;
      }
    } catch {
      // network blip — try again
    }
    // Generic retry path for non-OK or thrown errors while we believe a
    // rebuild is still active.
    pollTimer.current = setTimeout(() => void pollStatus(), STATUS_POLL_MS);
  }, [videoId]);

  const runRebuild = useCallback(async () => {
    if (selected.size === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    setStatus(null);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    if (pollTimer.current) clearTimeout(pollTimer.current);

    // Kick off polling immediately — the bridge writes the initial status
    // synchronously inside POST handler before any part starts, so the first
    // tick (≤1s after submit) typically returns the seeded status.
    pollTimer.current = setTimeout(() => void pollStatus(), STATUS_POLL_MS);

    try {
      const res = await fetch(
        `/api/youtube/rebuild/${encodeURIComponent(videoId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parts: Array.from(selected),
            ...(url ? { url } : {}),
          }),
        }
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      // Discard the response body — polling drives display now.
      await res.json().catch(() => undefined);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rebuild failed");
    } finally {
      setSubmitting(false);
      // POST returned (or failed) — fetch one more status snapshot so the
      // final state appears even if the polling loop is mid-wait.
      void pollStatus();
    }
  }, [selected, submitting, videoId, url, pollStatus]);

  const showStatus = status && status.parts.length > 0;
  const headerText = status && status.active ? "Rebuilding\u2026" : "Rebuild \u25be";

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-flex", gap: 8, alignItems: "center" }}>
      {showStatus ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {status.parts.map((p) => (
            <PartRow key={p.part} part={p} />
          ))}
        </div>
      ) : null}

      <Button
        type="button"
        variant="primary"
        onClick={() => setOpen((v) => !v)}
        disabled={submitting || (status?.active ?? false)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {submitting || status?.active ? "Rebuilding\u2026" : headerText}
      </Button>

      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 30,
            minWidth: 220,
          }}
        >
          <Card>
            <div
              style={{
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {ALL_PARTS.map((part) => (
                  <label
                    key={part}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(part)}
                      onChange={() => togglePart(part)}
                      disabled={submitting}
                    />
                    <span>{part}</span>
                  </label>
                ))}
              </div>
              {error ? (
                <div style={{ color: "var(--err, #f87171)", fontSize: 12 }}>
                  {error}
                </div>
              ) : null}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => void runRebuild()}
                  disabled={submitting || selected.size === 0}
                >
                  {submitting ? "Running\u2026" : "Run rebuild"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
