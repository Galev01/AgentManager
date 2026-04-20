"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { YoutubeRebuildPart } from "@openclaw-manager/types";
import { Badge, Button, Card } from "@/components/ui";

type Props = {
  videoId: string;
  url: string;
};

type RebuildResult = {
  part: YoutubeRebuildPart;
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

type RebuildResponse = {
  ok: boolean;
  videoId: string;
  results: RebuildResult[];
};

const ALL_PARTS: YoutubeRebuildPart[] = [
  "captions",
  "chunks",
  "summary",
  "highlights",
  "chapters",
  "chat-history",
];

const RESULT_DISMISS_MS = 5000;

function resultBadge(r: RebuildResult) {
  if (r.skipped) return <Badge tone="neutral">skipped</Badge>;
  if (r.ok) return <Badge tone="ok">ok</Badge>;
  return <Badge tone="error">failed</Badge>;
}

export function RebuildMenu({ videoId, url }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<YoutubeRebuildPart>>(
    () => new Set<YoutubeRebuildPart>()
  );
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<RebuildResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Auto-dismiss results after 5s
  useEffect(() => {
    if (!results) return;
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => {
      setResults(null);
    }, RESULT_DISMISS_MS);
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [results]);

  // Close dropdown on outside click
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

  const runRebuild = useCallback(async () => {
    if (selected.size === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    setResults(null);
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
      const data = (await res.json()) as RebuildResponse;
      setResults(data.results || []);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rebuild failed");
    } finally {
      setSubmitting(false);
    }
  }, [selected, submitting, videoId, url]);

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-flex", gap: 8, alignItems: "center" }}>
      {results && results.length > 0 ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {results.map((r) => (
            <span
              key={r.part}
              title={r.error || (r.skipped ? "skipped" : "ok")}
              style={{ display: "inline-flex", gap: 4, alignItems: "center" }}
            >
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {r.part}
              </span>
              {resultBadge(r)}
            </span>
          ))}
        </div>
      ) : null}

      <Button
        type="button"
        variant="primary"
        onClick={() => setOpen((v) => !v)}
        disabled={submitting}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {submitting ? "Rebuilding\u2026" : "Rebuild \u25be"}
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
