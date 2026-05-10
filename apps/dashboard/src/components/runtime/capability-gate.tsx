"use client";
import type { ReactNode } from "react";
import type { CapabilityId, RuntimeKind } from "@openclaw-manager/types";
import { useRuntimeHealth } from "@/hooks/use-runtime-health";

type Props = {
  runtimeId: string;
  capabilityId: CapabilityId | string;
  children: ReactNode;
  unsupportedFallback?: ReactNode;
};

export function CapabilityGate({ runtimeId, capabilityId, children, unsupportedFallback }: Props) {
  const { snapshot, isLoading, error } = useRuntimeHealth();

  // First load: render children rather than blanking the page. UI ops can
  // tolerate a momentary "supported" guess; a hard skeleton flicker is
  // worse for our consoles than a brief render of a feature that turns out
  // to be partial/unsupported.
  if (isLoading && !snapshot) return <>{children}</>;

  // Fail-open on errors: never let a health-endpoint hiccup blank out the UI.
  if (error || !snapshot) return <>{children}</>;

  const runtime = snapshot.runtimes.find((r) => r.runtimeId === runtimeId);
  if (!runtime) return <>{children}</>;

  // Disabled runtimes have no capability snapshot — show fallback like
  // unsupported, but with kind-aware copy.
  if (runtime.status === "disabled") {
    return <DefaultUnsupportedState
      capabilityId={capabilityId}
      runtimeId={runtimeId}
      reason="Runtime is disabled."
    />;
  }

  const caps = runtime.capabilities;
  if (!caps) {
    // Capabilities not available (e.g. runtime unhealthy) — show children;
    // the page-level health banner will surface the problem.
    return <>{children}</>;
  }

  if (caps.unsupported.includes(capabilityId as CapabilityId)) {
    return (
      <>
        {unsupportedFallback ?? (
          <DefaultUnsupportedState
            capabilityId={capabilityId}
            runtimeId={runtimeId}
          />
        )}
      </>
    );
  }

  const partial = caps.partial.find((p) => p.id === capabilityId);
  return (
    <>
      {partial ? <PartialBadge reason={partial.reason} /> : null}
      {children}
    </>
  );
}

export function PartialBadge({ reason }: { reason: string }) {
  return (
    <div
      role="note"
      aria-label="Partial support"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 12,
        padding: "8px 12px",
        borderRadius: "var(--radius, 8px)",
        border: "1px solid rgba(234, 179, 8, 0.35)",
        background: "rgba(234, 179, 8, 0.08)",
        color: "rgb(253, 224, 71)",
        fontSize: 12,
      }}
    >
      <span
        style={{
          padding: "1px 6px",
          borderRadius: 999,
          border: "1px solid rgba(234, 179, 8, 0.5)",
          background: "rgba(234, 179, 8, 0.15)",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        Partial
      </span>
      <span>{reason}</span>
    </div>
  );
}

export function DefaultUnsupportedState({
  capabilityId,
  runtimeId,
  reason,
  runtimeKind,
  runtimeName,
}: {
  capabilityId: CapabilityId | string;
  runtimeId: string;
  reason?: string;
  runtimeKind?: RuntimeKind;
  runtimeName?: string;
}) {
  const target = runtimeName ?? runtimeId;
  const kind = runtimeKind ? ` (${runtimeKind})` : "";
  return (
    <div
      role="status"
      style={{
        padding: "16px 18px",
        borderRadius: "var(--radius, 8px)",
        border: "1px dashed rgba(148, 163, 184, 0.35)",
        background: "rgba(15, 23, 42, 0.4)",
        color: "var(--text-muted, rgb(148, 163, 184))",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--text, rgb(226, 232, 240))" }}>
        Not supported on {target}
        {kind}
      </div>
      <div>
        <span style={{ fontFamily: "var(--font-mono, JetBrains Mono), monospace", fontSize: 12 }}>
          {capabilityId}
        </span>{" "}
        — {reason ?? "this runtime does not implement the capability."}
      </div>
      <div style={{ marginTop: 8, fontSize: 12 }}>
        Switch to another runtime via the header dropdown if one is configured, or visit{" "}
        <a href="/runtimes" style={{ textDecoration: "underline" }}>
          Runtimes
        </a>{" "}
        to inspect the matrix.
      </div>
    </div>
  );
}
