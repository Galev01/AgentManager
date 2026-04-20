/* Overview screen — "what needs attention right now" first */

const AttentionCard = ({ layoutVariant }) => {
  const { reviewInbox, pendingReviews } = window.DATA.overview;
  return (
    <div className="attn-main">
      <div className="attn-eyebrow"><span className="dot"/>Needs your attention</div>
      <div className="attn-big mono">{reviewInbox}<em>drafts awaiting your review</em></div>
      <div className="attn-desc">
        Your agents produced replies that tripped safety or uncertainty flags. Review, edit, and release — or let them auto-send after the configured 15-minute grace window.
      </div>
      <div className="attn-list">
        {pendingReviews.map(r => (
          <div className="attn-row" key={r.id}>
            <Badge kind="acc">{r.agent}</Badge>
            <div>
              <div className="ttl">{r.snippet}</div>
              <div className="by mono">{r.id} · {r.who}</div>
            </div>
            <Badge kind="warn">{r.flagged}</Badge>
            <button className="btn">Open<I.right/></button>
          </div>
        ))}
      </div>
    </div>
  );
};

const SystemStatus = () => {
  const items = [
    { k: window.DATA.gateway, extra: "38ms p50 · 8ms p99" },
    { k: window.DATA.bridge,  extra: "2 sessions healthy · 0 stalled" },
    { k: window.DATA.relay,   extra: "backoff 24s · resumes 14:43" },
    { k: window.DATA.llm,     extra: "sonnet-4.5 · 4,281 tok/min" },
  ];
  return (
    <div className="mini">
      <div className="mini-h">System</div>
      {items.map((it, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "18px 1fr auto", gap: 10, alignItems: "center", padding: "6px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
          <span className={`dot-lamp ${it.k.status}`} style={{ margin: 0 }}/>
          <div>
            <div style={{ fontWeight: 500, color: "var(--text)", fontSize: 12.5 }}>{it.k.label}</div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 2 }}>{it.extra}</div>
          </div>
          <Badge kind={it.k.status === "ok" ? "ok" : it.k.status === "warn" ? "warn" : "err"}>{it.k.status}</Badge>
        </div>
      ))}
    </div>
  );
};

const ActivityFeed = () => {
  const { activity } = window.DATA.overview;
  return (
    <div className="mini">
      <div className="mini-h">
        <span className="dot-lamp ok" style={{ margin: 0 }}/>
        Live activity
        <span style={{ marginLeft: "auto", fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--text-faint)", textTransform: "none", letterSpacing: 0 }}>tail -f</span>
      </div>
      <div style={{ maxHeight: 260, overflowY: "auto", marginTop: -2 }}>
        {activity.map((l, i) => (
          <div className="log-line" key={i}>
            <span className="t">{l.time}</span>
            <span className={`lv ${l.lvl}`}>{l.lvl === "i" ? "INFO" : l.lvl === "o" ? "OK" : l.lvl === "w" ? "WARN" : "ERR"}</span>
            <span className="m" dangerouslySetInnerHTML={{__html: l.msg}}/>
          </div>
        ))}
      </div>
    </div>
  );
};

const OverviewScreen = ({ layoutVariant }) => {
  const { stats } = window.DATA.overview;
  return (
    <>
      <div className="page-h">
        <div>
          <div className="page-title">Overview</div>
          <div className="page-sub">Wed, April 19 · runtime 4d 11h · Europe/Berlin</div>
        </div>
        <div className="page-actions">
          <button className="btn"><I.refresh/>Refresh</button>
          <button className="btn"><I.sparkles/>Ask OpenClaw</button>
          <button className="btn btn-pri"><I.plus/>New agent</button>
        </div>
      </div>

      {layoutVariant === "attention" ? (
        <>
          <div className="attn">
            <AttentionCard/>
            <div className="attn-side">
              <SystemStatus/>
              <ActivityFeed/>
            </div>
          </div>
          <div className="grid g-4">
            {stats.map((s, i) => <StatCard key={i} {...s}/>)}
          </div>
        </>
      ) : layoutVariant === "cards" ? (
        <>
          <div style={{ height: 20 }}/>
          <div className="grid g-4" style={{ marginBottom: "var(--row-gap)" }}>
            {stats.map((s, i) => <StatCard key={i} {...s}/>)}
          </div>
          <div className="grid g-2">
            <AttentionCard/>
            <div className="attn-side">
              <SystemStatus/>
              <ActivityFeed/>
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={{ height: 20 }}/>
          <div className="grid g-2" style={{ marginBottom: "var(--row-gap)" }}>
            <AttentionCard/>
            <ActivityFeed/>
          </div>
          <div className="grid" style={{ gridTemplateColumns: "3fr 1fr" }}>
            <div className="grid g-4" style={{ gridColumn: "1 / 2" }}>
              {stats.map((s, i) => <StatCard key={i} {...s}/>)}
            </div>
            <SystemStatus/>
          </div>
        </>
      )}
    </>
  );
};
