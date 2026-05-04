import type { FallbackReason } from "@openclaw-manager/types";

const REASON_TEXT: Record<FallbackReason, string> = {
  configured_primary_disabled:
    "Configured primary runtime is disabled. Effective primary has fallen back.",
  configured_primary_missing:
    "Configured primary runtime is missing or not set. Effective primary has fallen back.",
};

export function RuntimeFallbackBanner({
  reason, configured, effective,
}: {
  reason: FallbackReason | null;
  configured: string | null;
  effective: string | null;
}) {
  if (!reason) return null;
  return (
    <div className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
      <div className="font-medium">{REASON_TEXT[reason]}</div>
      <div className="text-amber-300/80 mt-1">
        Configured: <code>{configured ?? "—"}</code> · Effective: <code>{effective ?? "—"}</code>
      </div>
    </div>
  );
}
