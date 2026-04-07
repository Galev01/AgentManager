import type { OverviewData } from "@openclaw-manager/types";
import { timeAgo } from "@/lib/format";

type StatCardProps = { label: string; value: number; subtitle?: string; color: string; dotColor: string };

function StatCard({ label, value, subtitle, color, dotColor }: StatCardProps) {
  return (
    <div className="rounded bg-dark-card p-6 shadow-card-dark">
      <div className="flex items-center gap-3">
        <span className={`inline-block h-3 w-3 rounded-full ${dotColor}`} />
        <span className="text-sm text-text-gray">{label}</span>
      </div>
      <p className={`mt-3 text-4xl font-semibold tracking-tight ${color}`}>{value}</p>
      {subtitle && <p className="mt-1 text-xs text-text-muted">{subtitle}</p>}
    </div>
  );
}

export function OverviewCards({ data }: { data: OverviewData }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Total Conversations" value={data.totalConversations} color="text-text-primary" dotColor="bg-primary" />
      <StatCard label="Active" value={data.activeCount} subtitle={data.wakingCount > 0 ? `${data.wakingCount} waking` : undefined} color="text-success" dotColor="bg-success" />
      <StatCard label="Human Takeover" value={data.humanCount} color="text-danger" dotColor="bg-danger" />
      <StatCard label="Cold" value={data.coldCount} color="text-text-muted" dotColor="bg-text-muted" />
    </div>
  );
}

export function OverviewMeta({ data, activeModel }: { data: OverviewData; activeModel?: string | null }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-6 rounded bg-dark-card p-6 shadow-card-dark">
      <div>
        <span className="text-xs text-text-muted">Active Model</span>
        <p className="text-sm font-medium text-primary">{activeModel || <span className="text-text-muted">Unknown</span>}</p>
      </div>
      <div className="h-8 w-px bg-dark-border" />
      <div>
        <span className="text-xs text-text-muted">Last Activity</span>
        <p className="text-sm text-text-primary">{timeAgo(data.lastActivityAt)}</p>
      </div>
      <div className="h-8 w-px bg-dark-border" />
      <div>
        <span className="text-xs text-text-muted">Relay Target</span>
        <p className="text-sm text-text-primary">{data.relayTarget || <span className="text-text-muted">Not set</span>}</p>
      </div>
    </div>
  );
}
