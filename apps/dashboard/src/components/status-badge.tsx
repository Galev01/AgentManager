import type { ConversationStatus } from "@openclaw-manager/types";
import { Badge, type BadgeKind } from "./ui";

const STATUS_KIND: Record<ConversationStatus, BadgeKind> = {
  active: "ok",
  human: "err",
  waking: "warn",
  cold: "mute",
};

const STATUS_LABELS: Record<ConversationStatus, string> = {
  active: "Active",
  human: "Human",
  waking: "Waking",
  cold: "Cold",
};

export function StatusBadge({ status }: { status: ConversationStatus }) {
  return (
    <Badge kind={STATUS_KIND[status]} dot>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
