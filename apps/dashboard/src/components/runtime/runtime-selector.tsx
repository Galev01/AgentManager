"use client";
import { useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useRuntimeHealth } from "@/hooks/use-runtime-health";
import type { RuntimeHealthEntry } from "@/lib/runtime-client";

/**
 * Dropdown that selects the active runtime via the `?runtimeId=` URL search
 * param. Defaults to the snapshot's `primaryRuntimeId` when the param is
 * absent. The header mounts this; pages read the same param to project
 * catalog data against the chosen runtime.
 */
export function RuntimeSelector() {
  const { snapshot, isLoading, error } = useRuntimeHealth();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const explicit = searchParams?.get("runtimeId") ?? null;

  const runtimes = snapshot?.runtimes ?? [];
  const activeId = explicit ?? snapshot?.primaryRuntimeId ?? null;
  const active = useMemo<RuntimeHealthEntry | null>(() => {
    if (!activeId) return null;
    return runtimes.find((r) => r.runtimeId === activeId) ?? null;
  }, [runtimes, activeId]);

  if (isLoading && !snapshot) {
    return (
      <div className="hd-rt-sel" aria-label="Loading runtimes" style={selectorStyle()}>
        <span style={{ ...dotStyle("checking") }} />
        <span style={{ fontSize: 12 }}>loading runtimes…</span>
      </div>
    );
  }

  if (error && !snapshot) {
    return (
      <div className="hd-rt-sel" title={error.message} style={selectorStyle()}>
        <span style={{ ...dotStyle("err") }} />
        <span style={{ fontSize: 12 }}>runtimes unreachable</span>
      </div>
    );
  }

  if (runtimes.length === 0) {
    return (
      <div className="hd-rt-sel" style={selectorStyle()}>
        <span style={{ fontSize: 12 }}>no runtimes</span>
      </div>
    );
  }

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (!next || next === snapshot?.primaryRuntimeId) {
      params.delete("runtimeId");
    } else {
      params.set("runtimeId", next);
    }
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  const selectedKey = active?.runtimeId ?? snapshot?.primaryRuntimeId ?? "";

  const tooltip = (() => {
    if (!active) return undefined;
    if (active.status === "unhealthy") return active.error ?? "unhealthy";
    if (active.status === "disabled") return "disabled";
    return undefined;
  })();

  return (
    <label
      className="hd-rt-sel"
      title={tooltip}
      style={selectorStyle()}
    >
      <span style={dotStyle(statusFor(active))} />
      <span style={{ fontSize: 11, color: "var(--text-muted, rgb(148, 163, 184))" }}>runtime</span>
      <select
        aria-label="Active runtime"
        value={selectedKey}
        onChange={onChange}
        style={{
          background: "transparent",
          border: "none",
          outline: "none",
          color: "inherit",
          fontSize: 12,
          fontWeight: 500,
          appearance: "none",
          paddingRight: 4,
          cursor: "pointer",
        }}
      >
        {runtimes.map((r) => {
          // Build a kind hint from capabilities. /runtimes/health does not
          // ship descriptors, so we display the runtimeId as the canonical
          // user-facing label and rely on the kind badge in pages.
          return (
            <option key={r.runtimeId} value={r.runtimeId}>
              {r.runtimeId}
              {snapshot?.primaryRuntimeId === r.runtimeId ? " (primary)" : ""}
              {r.status === "unhealthy" ? " — unhealthy" : ""}
              {r.status === "disabled" ? " — disabled" : ""}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function statusFor(entry: RuntimeHealthEntry | null): "ok" | "warn" | "err" | "checking" {
  if (!entry) return "checking";
  if (entry.status === "healthy") return "ok";
  if (entry.status === "disabled") return "warn";
  return "err";
}

function selectorStyle(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid var(--border, rgba(148, 163, 184, 0.25))",
    background: "var(--surface, rgba(15, 23, 42, 0.4))",
    color: "var(--text, rgb(226, 232, 240))",
    fontSize: 12,
  };
}

function dotStyle(status: "ok" | "warn" | "err" | "checking"): React.CSSProperties {
  const color =
    status === "ok"
      ? "rgb(16, 185, 129)"
      : status === "warn"
        ? "rgb(234, 179, 8)"
        : status === "err"
          ? "rgb(239, 68, 68)"
          : "rgb(148, 163, 184)";
  return {
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: 999,
    background: color,
    boxShadow: status === "ok" ? "0 0 0 3px rgba(16, 185, 129, 0.18)" : undefined,
  };
}
