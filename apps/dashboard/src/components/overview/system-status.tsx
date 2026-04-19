import { StatusLamp } from "@/components/ui/status-lamp";
import { Badge } from "@/components/ui/badge";
import type { LampStatus } from "@/components/ui/status-lamp";
import type { BadgeKind } from "@/components/ui/badge";

interface SystemRow {
  label: string;
  status: LampStatus;
  detail: string;
}

interface SystemStatusProps {
  rows: SystemRow[];
}

function statusToBadgeKind(s: LampStatus): BadgeKind {
  if (s === "ok") return "ok";
  if (s === "warn") return "warn";
  if (s === "err") return "err";
  return "mute";
}

export function SystemStatus({ rows }: SystemStatusProps) {
  return (
    <div className="mini">
      <div className="mini-h">System</div>
      {rows.map((row, i) => (
        <div
          key={row.label}
          style={{
            display: "grid",
            gridTemplateColumns: "18px 1fr auto",
            gap: 10,
            alignItems: "center",
            padding: "6px 0",
            borderTop: i ? "1px solid var(--border)" : "none",
          }}
        >
          <StatusLamp status={row.status} />
          <div>
            <div style={{ fontWeight: 500, color: "var(--text)", fontSize: 12.5 }}>
              {row.label}
            </div>
            <div
              className="mono"
              style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 2 }}
            >
              {row.detail}
            </div>
          </div>
          <Badge kind={statusToBadgeKind(row.status)}>{row.status}</Badge>
        </div>
      ))}
    </div>
  );
}
