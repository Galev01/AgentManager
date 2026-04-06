import type { ConversationStatus } from "@openclaw-manager/types";

const STATUS_STYLES: Record<ConversationStatus, string> = {
  active: "bg-success/10 text-success border-success/20",
  human: "bg-danger/10 text-danger border-danger/20",
  waking: "bg-warning/10 text-warning border-warning/20",
  cold: "bg-text-muted/10 text-text-muted border-text-muted/20",
};

const STATUS_LABELS: Record<ConversationStatus, string> = {
  active: "Active", human: "Human", waking: "Waking", cold: "Cold",
};

export function StatusBadge({ status }: { status: ConversationStatus }) {
  return (
    <span className={`inline-flex items-center rounded-pill border px-3 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
        status === "active" ? "bg-success" : status === "human" ? "bg-danger" : status === "waking" ? "bg-warning" : "bg-text-muted"
      }`} />
      {STATUS_LABELS[status]}
    </span>
  );
}
