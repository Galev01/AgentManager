import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface AttentionRow {
  id: string;
  agent: string;
  who: string;
  snippet: string;
  flagged: string;
  projectId: string;
  reportDate: string;
}

interface AttentionCardProps {
  pendingReviewCount: number;
  recent: AttentionRow[];
  unavailable?: boolean;
}

export function AttentionCard({ pendingReviewCount, recent, unavailable }: AttentionCardProps) {
  if (unavailable) {
    return (
      <div className="attn-main">
        <div className="attn-eyebrow">
          <span className="dot" />
          Needs your attention
        </div>
        <div className="attn-big mono">
          ?<em>review inbox unavailable</em>
        </div>
        <div className="attn-desc" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span className="badge warn">warn</span>
          Review inbox unavailable — showing last known state
        </div>
      </div>
    );
  }

  if (pendingReviewCount === 0) {
    return (
      <div className="attn-main">
        <div className="attn-eyebrow">
          <span className="dot" />
          Needs your attention
        </div>
        <div className="attn-big mono">
          0<em>drafts awaiting your review</em>
        </div>
        <div className="attn-desc" style={{ color: "var(--ok)", marginTop: 12 }}>
          All clear — no drafts need review.
        </div>
      </div>
    );
  }

  return (
    <div className="attn-main">
      <div className="attn-eyebrow">
        <span className="dot" />
        Needs your attention
      </div>
      <div className="attn-big mono">
        {pendingReviewCount}
        <em>drafts awaiting your review</em>
      </div>
      <div className="attn-desc">
        Your agents produced replies that tripped safety or uncertainty flags. Review,
        edit, and release — or let them auto-send after the configured 15-minute grace
        window.
      </div>
      {recent.length > 0 && (
        <div className="attn-list">
          {recent.map((r) => (
            <div className="attn-row" key={r.id}>
              <Badge kind="acc">{r.agent}</Badge>
              <div>
                <div className="ttl">{r.snippet}</div>
                <div className="by mono">
                  {r.id} · {r.who}
                </div>
              </div>
              <Badge kind="warn">{r.flagged}</Badge>
              <Link
                href={`/reviews/${r.projectId}?date=${r.reportDate}`}
                className="btn"
              >
                Open →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
