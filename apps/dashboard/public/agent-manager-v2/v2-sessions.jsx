/* v2-sessions.jsx */

const UP = {
  ok:   'ggggggggggggggggggggggg',
  warn: 'ggggggggggggggggwwwgggw',
  err:  'ggggggggeeeeeeeeeeeeeee',
  off:  'ooooooooooooooooooooooo',
};

function V2SessionsScreen() {
  const sessions = window.AM_DATA.sessions;

  return (
    <div className="v2-screen">
      <div className="v2-ph">
        <div className="v2-ph-left">
          <div className="v2-ph-title">Sessions</div>
          <div className="v2-ph-sub">5 runtime sessions · 2 whatsapp · 2 youtube · 1 stopped</div>
        </div>
        <div className="v2-ph-actions">
          <button className="v2-btn"><IC.refresh />Refresh</button>
          <button className="v2-btn v2-btn-pri"><IC.plus />New session</button>
        </div>
      </div>

      <div className="v2-sess-hero">
        {[
          { label: 'Running',        value: '3',     sub: 'of 5 sessions',   spark: [3,3,4,3,3,4,3,3,3,3,3] },
          { label: 'Heartbeat p50',  value: '48',    sub: 'ms · stable',     spark: [42,40,45,48,44,46,50,48,46,44,48], unit: 'ms' },
          { label: 'Msgs / 24h',     value: '1,284', sub: '+18.2%',          spark: [20,34,44,51,30,48,66,71,58,63,80], color: 'var(--ok)' },
          { label: 'Crash loops',    value: '1',     sub: 'yt.relay.shorts', spark: [0,0,0,0,1,1,1,0,0,1,1], color: 'var(--err)' },
        ].map((s, i) => (
          <div key={i} className={`v2-c${i}`}>
            <V2Stat {...s} delay={i * 60} />
          </div>
        ))}
      </div>

      <div className="v2-card" style={{ marginBottom: 16 }}>
        <table className="v2-tbl">
          <thead>
            <tr>
              <th style={{ width: 28 }}></th>
              <th>Session</th>
              <th>Channel</th>
              <th>Agent</th>
              <th>Uptime · 24h</th>
              <th>Heartbeat</th>
              <th style={{ textAlign: 'right' }}>Msgs 24h</th>
              <th>Started</th>
              <th style={{ width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => (
              <tr key={s.id}>
                <td><V2Dot status={s.status} /></td>
                <td>
                  <div className="pri" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{s.id}</div>
                  <div className="v2-row-sub">{s.device}</div>
                </td>
                <td>
                  <V2Badge kind={s.kind === 'whatsapp' ? 'ok' : 'info'}>{s.kind}</V2Badge>
                  <div className="v2-row-sub">{s.phone}</div>
                </td>
                <td>
                  {s.agent === '—'
                    ? <span style={{ color: 'var(--t4)' }}>—</span>
                    : <V2Badge kind="acc">{s.agent}</V2Badge>}
                </td>
                <td>
                  <div className="v2-uptime-wrap">
                    <V2UptimeBar pattern={UP[s.status]} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t1)', marginLeft: 4 }}>
                      {s.uptime != null ? s.uptime + '%' : '—'}
                    </span>
                  </div>
                </td>
                <td>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: s.hb === 'timeout' ? 'var(--err)' : 'var(--t1)' }}>{s.hb}</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <span className="pri" style={{ fontFamily: 'var(--mono)' }}>{s.msgs.toLocaleString()}</span>
                </td>
                <td>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t3)' }}>{s.started}</span>
                </td>
                <td>
                  <button className="v2-btn v2-btn-ghost v2-btn-sm" style={{ padding: '3px 5px' }}><IC.dots /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="v2-g2">
        {/* Crash loop */}
        <div className="v2-mini v2-c0" style={{ borderColor: 'oklch(0.65 0.22 25 / 0.35)', background: 'var(--err-d)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: -1, border: '1px solid var(--err)', borderRadius: 'inherit', opacity: 0.2, animation: 'v2-pulse-err 1s infinite', pointerEvents: 'none' }} />
          <div className="v2-mini-h"><V2Dot status="err" />Crash loop · yt.relay.shorts</div>
          <div style={{ fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.65, marginBottom: 12 }}>
            Session restarted <b style={{ color: 'var(--t1)' }}>4 times in 14 minutes</b>. Last exit:{' '}
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--err)', fontSize: 11 }}>ECONNRESET from youtube endpoint</span>.
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="v2-btn v2-btn-pri v2-btn-sm"><IC.play />Restart once</button>
            <button className="v2-btn v2-btn-sm"><IC.pause />Pause auto-restart</button>
            <button className="v2-btn v2-btn-sm">View logs</button>
          </div>
        </div>

        {/* Schedule */}
        <div className="v2-mini v2-c1">
          <div className="v2-mini-h">Scheduled jobs · next 24h</div>
          {[
            ['02:00', 'nightly.brain-compact',  'scribe',   'daily'],
            ['06:00', 'session.health-check',   'sentinel', '6h'],
            ['09:30', 'backup.brain-snapshot',  'system',   'daily'],
            ['14:00', 'yt.relay.reauth',         'yt_mod',   '12h'],
          ].map(([t, job, ag, freq], i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '46px 1fr auto auto', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: i ? '1px solid var(--b1)' : 'none' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t4)' }}>{t}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--t1)' }}>{job}</span>
              <V2Badge kind="mute">{ag}</V2Badge>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)' }}>{freq}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { V2SessionsScreen });
