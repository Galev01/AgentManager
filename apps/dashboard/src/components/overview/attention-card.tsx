import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface AttentionRow {
  id: string;
  agent: string;
  who: string;
  snippet: string;
  flagged: string;
}

interface AttentionCardProps {
  pendingReviewCount: number;
  recent: AttentionRow[];
}

export function AttentionCard({ pendingReviewCount, recent }: AttentionCardProps) {
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
              <Link href={`/reviews`} className="btn" style={{ textDecoration: "none" }}>
                Open →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
