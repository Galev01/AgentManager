/* v2-overview.jsx */

function SystemStatus() {
  const sys = window.AM_DATA.system;
  return (
    <div className="v2-mini">
      <div className="v2-mini-h">System</div>
      {Object.values(sys).map((s, i) => (
        <div key={s.label} style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: i ? '1px solid var(--b1)' : 'none' }}>
          <V2Dot status={s.status} />
          <div>
            <div style={{ fontWeight: 500, color: 'var(--t1)', fontSize: 12.5 }}>{s.label}</div>
            <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 2, fontFamily: 'var(--mono)' }}>{s.detail}</div>
          </div>
          <V2Badge kind={s.status === 'ok' ? 'ok' : s.status === 'warn' ? 'warn' : 'err'}>{s.status}</V2Badge>
        </div>
      ))}
    </div>
  );
}

function ActivityFeed() {
  const { activity } = window.AM_DATA.overview;
  const LV = { i: 'INFO', o: 'OK', w: 'WARN', e: 'ERR' };
  const LC = { i: 'v2-log-i', o: 'v2-log-o', w: 'v2-log-w', e: 'v2-log-e' };
  return (
    <div className="v2-mini" style={{ flex: 1 }}>
      <div className="v2-mini-h">
        <V2Dot status="ok" />
        Live activity
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', textTransform: 'none', letterSpacing: 0 }}>tail -f</span>
      </div>
      <div className="v2-log">
        {activity.map((l, i) => (
          <div key={i} className="v2-log-line" style={{ animationDelay: `${i * 40}ms` }}>
            <span className="v2-log-t">{l.t}</span>
            <span className={`v2-log-lv ${LC[l.lv]}`}>{LV[l.lv]}</span>
            <span className="v2-log-m" dangerouslySetInnerHTML={{ __html: l.msg }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AttentionBanner() {
  const { inbox, pending } = window.AM_DATA.overview;
  return (
    <div className="v2-attn">
      <div className="v2-attn-eyebrow">
        <span className="v2-attn-dot" />
        Needs your attention
      </div>
      <div className="v2-attn-big">
        {inbox}
        <em>drafts awaiting review</em>
      </div>
      <div className="v2-attn-desc">
        Agents produced replies that tripped safety or uncertainty flags. Review, edit, and release — or auto-send after the 15-minute grace window.
      </div>
      {pending.map(r => (
        <div className="v2-attn-row" key={r.id}>
          <V2Badge kind="acc">{r.agent}</V2Badge>
          <div>
            <div className="ttl">{r.snippet}</div>
            <div className="by">{r.id} · {r.who}</div>
          </div>
          <V2Badge kind="warn">{r.flags}</V2Badge>
          <button className="v2-btn v2-btn-sm">Open <IC.right /></button>
        </div>
      ))}
    </div>
  );
}

function V2OverviewScreen() {
  const { stats } = window.AM_DATA.overview;
  const colors = [undefined, 'var(--cyan)', 'var(--ok)', 'var(--err)'];
  return (
    <div className="v2-screen">
      <div className="v2-ph">
        <div className="v2-ph-left">
          <div className="v2-ph-title">Overview</div>
          <div className="v2-ph-sub">Fri, May 16 · runtime 4d 11h · Europe/Berlin</div>
        </div>
        <div className="v2-ph-actions">
          <button className="v2-btn"><IC.refresh />Refresh</button>
          <button className="v2-btn"><IC.sparkles />Ask Agent</button>
          <button className="v2-btn v2-btn-pri"><IC.plus />New agent</button>
        </div>
      </div>

      <AttentionBanner />

      <div className="v2-stat-grid" style={{ marginBottom: 20 }}>
        {stats.map((s, i) => (
          <div key={i} className={`v2-c${i}`}>
            <V2Stat label={s.label} value={s.value} sub={s.sub} unit={s.unit} spark={s.spark} color={colors[i]} delay={i * 60} />
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 14 }}>
        <ActivityFeed />
        <SystemStatus />
      </div>
    </div>
  );
}

Object.assign(window, { V2OverviewScreen });
