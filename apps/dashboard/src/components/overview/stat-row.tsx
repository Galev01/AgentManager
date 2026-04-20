import { StatCard } from "@/components/ui/stat";
import type { OverviewData } from "@openclaw-manager/types";

interface StatRowProps {
  data: OverviewData;
}

export function StatRow({ data }: StatRowProps) {
  return (
    <div className="hero-4">
      <StatCard
        label="Active Conversations"
        value={data.activeCount}
      />
      <StatCard
        label="Human Takeover"
        value={data.humanCount}
      />
      <StatCard
        label="Cold Conversations"
        value={data.coldCount}
      />
      <StatCard
        label="Total Conversations"
        value={data.totalConversations}
      />
    </div>
  );
}
