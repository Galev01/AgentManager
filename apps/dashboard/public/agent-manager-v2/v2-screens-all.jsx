/* v2-screens-all.jsx — combined screens + app */

/* ── v2-overview.jsx ── */
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


/* ── v2-convs.jsx ── */
function V2ConvsScreen({ selectedId, onSelect }) {
  const list = window.AM_DATA.conversations;
  const t = window.AM_DATA.thread;

  return (
    <div className="v2-screen" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0 }}>
      {/* Thin page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderBottom: '1px solid var(--b1)', background: 'var(--bg)', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em' }}>Conversations</div>
        <V2Badge kind="mute">10</V2Badge>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
          <button className="v2-btn v2-btn-sm"><IC.filter />agent: any</button>
          <button className="v2-btn v2-btn-sm"><IC.filter />status: any</button>
          <button className="v2-btn v2-btn-sm"><IC.pause />Pause all</button>
        </div>
      </div>

      <div className="v2-conv">
        {/* ── Thread list ── */}
        <div className="v2-conv-pane">
          <div className="v2-conv-ph">
            Threads
            <V2Badge kind="mute">{list.length}</V2Badge>
            <button className="v2-btn v2-btn-ghost v2-btn-sm" style={{ marginLeft: 'auto', padding: '2px 6px' }}><IC.search /></button>
          </div>
          <div className="v2-conv-body">
            {list.map((c, i) => (
              <div key={c.id} className={`v2-conv-item${(selectedId || 'c1') === c.id ? ' sel' : ''}`}
                onClick={() => onSelect(c.id)}
                style={{ animationDelay: `${i * 30}ms` }}>
                <V2Av color={c.color} text={c.av} size={32} />
                <div className="v2-conv-item-main">
                  <div className="v2-conv-item-name">{c.name}</div>
                  <div className="v2-conv-item-snip">
                    {c.review && <V2Dot status="warn" style={{ width: 5, height: 5 }} />}
                    {c.snippet}
                  </div>
                </div>
                <div className="v2-conv-item-meta">
                  <span className="v2-conv-item-time">{c.at}</span>
                  {c.unread
                    ? <span className="v2-conv-unread">{c.unread}</span>
                    : <span className="v2-conv-agent">{c.agent}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Thread view ── */}
        <div className="v2-conv-pane">
          <div className="v2-thr-head">
            <V2Av color={t.color} text={t.av} size={34} />
            <div>
              <div className="n">{t.name}</div>
              <div className="s"><span>{t.phone}</span><span>·</span><span>session={t.session}</span></div>
            </div>
            <div className="v2-thr-head-btns">
              <button className="v2-btn v2-btn-sm"><IC.pause /></button>
              <button className="v2-btn v2-btn-sm"><IC.external /></button>
              <button className="v2-btn v2-btn-sm"><IC.dots /></button>
            </div>
          </div>

          <div className="v2-thr-body">
            {t.msgs.map((m, i) => {
              if (m.k === 'sys') return (
                <div key={i} className="v2-msg-sys">
                  <span className="ln" /><span dangerouslySetInnerHTML={{ __html: m.text }} /><span className="ln" />
                </div>
              );
              return (
                <div key={i} className={`v2-msg ${m.k === 'them' ? 'v2-msg-them' : 'v2-msg-us'}`}
                  style={{ animation: `v2-card-in 220ms var(--ease) ${i * 40}ms both` }}>
                  <div>{m.text}</div>
                  <div className="v2-msg-meta">
                    <span>{m.t}</span>
                    {m.by && <><span>·</span><span>via {m.by}</span></>}
                    {m.lat && <><span>·</span><span>{m.lat}</span></>}
                  </div>
                </div>
              );
            })}
            <div className="v2-thinking">
              <div className="v2-thinking-dots"><span /><span /><span /></div>
              <span>Drafting reply… (review flag — PII)</span>
            </div>
          </div>

          <div className="v2-thr-compose">
            <button className="v2-btn v2-btn-ghost v2-btn-sm"><IC.attach /></button>
            <div className="v2-thr-input">Take over and reply manually…</div>
            <button className="v2-btn v2-btn-ghost v2-btn-sm"><IC.sparkles /></button>
            <button className="v2-btn v2-btn-pri v2-btn-sm"><IC.send />Send</button>
          </div>
        </div>

        {/* ── Inspector ── */}
        <div className="v2-conv-pane">
          <div className="v2-conv-ph">Inspector <V2Badge kind="acc" dot>live</V2Badge></div>
          <div className="v2-conv-body">

            {/* Pending review */}
            <div className="v2-rp-sec">
              <div className="v2-rp-h">Pending review</div>
              <div style={{ padding: 10, background: 'var(--warn-d)', border: '1px solid oklch(0.82 0.14 75/0.25)', borderRadius: 'var(--r2)', fontSize: 12, color: 'var(--t1)', lineHeight: 1.6 }}>
                {t.draft}
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                {t.flags.map(f => <V2Badge key={f} kind="warn">{f}</V2Badge>)}
              </div>
              <div style={{ display: 'flex', gap: 5, marginTop: 10 }}>
                <button className="v2-btn v2-btn-pri v2-btn-sm" style={{ flex: 1, justifyContent: 'center' }}><IC.check />Approve</button>
                <button className="v2-btn v2-btn-sm" style={{ flex: 1, justifyContent: 'center' }}>Edit</button>
                <button className="v2-btn v2-btn-sm"><IC.x /></button>
              </div>
            </div>

            {/* Routing */}
            <div className="v2-rp-sec">
              <div className="v2-rp-h">Routing</div>
              <div className="v2-route">
                <span className="v2-chip">inbound.dm</span><span style={{ color: 'var(--t4)' }}>→</span>
                <span className="v2-chip">rule #2</span><span style={{ color: 'var(--t4)' }}>→</span>
                <span className="v2-chip v2-chip-a">concierge</span>
              </div>
              <div className="v2-route">
                <span className="v2-chip">brain.lookup</span><span style={{ color: 'var(--t4)' }}>·</span>
                <span className="v2-chip">hit=1</span><span style={{ color: 'var(--t4)' }}>·</span>
                <span className="v2-chip">12ms</span>
              </div>
            </div>

            {/* Contact */}
            <div className="v2-rp-sec">
              <div className="v2-rp-h">Contact</div>
              <V2KV entries={t.contact} />
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 10 }}>
                {t.tags.map(tag => <V2Badge key={tag} kind="mute">{tag}</V2Badge>)}
              </div>
            </div>

            {/* Brain notes */}
            <div className="v2-rp-sec">
              <div className="v2-rp-h">Brain notes · {t.brainNotes.length}</div>
              <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.7 }}>
                {t.brainNotes.map((n, i) => (
                  <div key={i} style={{ padding: '4px 0', borderTop: i ? '1px solid var(--b1)' : 'none' }}>· {n}</div>
                ))}
              </div>
            </div>

            {/* Tools */}
            <div className="v2-rp-sec">
              <div className="v2-rp-h">Tools used</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <V2Badge kind="info">brain.lookup</V2Badge>
                <V2Badge kind="info">billing.read</V2Badge>
                <V2Badge kind="info">links.unfurl</V2Badge>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { V2ConvsScreen });


/* ── v2-sessions.jsx ── */
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


/* ── v2-agents.jsx ── */
function V2AgentsScreen({ agentToggles, onToggle }) {
  const agents = window.AM_DATA.agents;

  return (
    <div className="v2-screen">
      <div className="v2-ph">
        <div className="v2-ph-left">
          <div className="v2-ph-title">Agents</div>
          <div className="v2-ph-sub">6 agents · 5 enabled · 1 sandboxed</div>
        </div>
        <div className="v2-ph-actions">
          <button className="v2-btn"><IC.filter />model: any</button>
          <button className="v2-btn v2-btn-pri"><IC.plus />New agent</button>
        </div>
      </div>

      <div className="v2-agent-grid">
        {agents.map((a, i) => {
          const isOn = agentToggles[a.id] !== undefined ? agentToggles[a.id] : a.on;
          return (
            <div key={a.id}
              className={`v2-agent-card v2-c${Math.min(i, 5)}${a.primary ? ' primary' : ''}`}
              style={{ '--agent-color': a.color, opacity: isOn ? 1 : 0.55 }}>
              <div className="v2-agent-toggle">
                <V2Sw on={isOn} onToggle={() => onToggle(a.id)} />
              </div>
              {a.primary && <div className="v2-agent-primary-tag">Primary</div>}
              <div className="v2-agent-h">
                <div style={{
                  width: 38, height: 38, minWidth: 38,
                  borderRadius: 10,
                  background: a.color,
                  display: 'grid', placeItems: 'center',
                  fontSize: 15, fontWeight: 700, color: 'white',
                  boxShadow: `0 4px 16px ${a.color.replace(')', ' / 0.4)').replace('oklch', 'oklch')}`,
                  flexShrink: 0,
                }}>{a.av}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="v2-agent-n">{a.name}</div>
                  <div className="v2-agent-id">id={a.id} · {a.model}</div>
                </div>
              </div>
              <div className="v2-agent-desc">{a.desc}</div>
              <div className="v2-agent-caps">
                {a.caps.slice(0, 4).map(c => <V2Badge key={c} kind="mute">{c}</V2Badge>)}
                {a.caps.length > 4 && <V2Badge kind="mute">+{a.caps.length - 4}</V2Badge>}
              </div>
              <div className="v2-agent-stats">
                {[
                  { l: 'Msgs 24h', v: a.msgs || '—' },
                  { l: 'p50',      v: a.p50 },
                  { l: 'Conf.',    v: a.conf != null ? a.conf + '%' : '—' },
                ].map(s => (
                  <div key={s.l}>
                    <div className="v2-agent-stat-l">{s.l}</div>
                    <div className="v2-agent-stat-v">{s.v}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Routing rules */}
      <div className="v2-mini">
        <div className="v2-mini-h">Routing rules</div>
        <div className="v2-card" style={{ marginTop: -4, border: 'none', borderRadius: 0, background: 'transparent' }}>
          <table className="v2-tbl">
            <thead>
              <tr>
                <th>#</th><th>Match</th><th>Condition</th><th>→ Agent</th><th>Handoff</th><th style={{ textAlign: 'right' }}>Hit 24h</th>
              </tr>
            </thead>
            <tbody>
              {[
                [1,'wa.group',       'channel == "whatsapp" && chat.type == "group"',  'concierge',   '→ human if @mention',         108],
                [2,'inbound.dm',     'channel == "whatsapp" && chat.type == "dm"',     'concierge',   '→ support_hub if topic:billing',734],
                [3,'support.keyword','msg ~ /refund|invoice|cancel/i',                  'support_hub', '—',                           312],
                [4,'yt.livechat',    'channel == "youtube" && kind == "livechat"',     'yt_mod',      '→ concierge if flagged',       104],
              ].map(([n, match, cond, agent, handoff, hits]) => (
                <tr key={n}>
                  <td style={{ color: 'var(--t4)', fontFamily: 'var(--mono)', fontSize: 11 }}>{n}</td>
                  <td><V2Badge kind="info">{match}</V2Badge></td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t2)', maxWidth: 260 }}>{cond}</td>
                  <td><V2Badge kind="acc">{agent}</V2Badge></td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--t4)' }}>{handoff}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--t1)' }}>{hits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { V2AgentsScreen });


/* ── v2-cc.jsx ── */
function ccRelTime(iso) {
  const d = Date.now() - new Date(iso).getTime(), m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function fmtTok(n) {
  if (!n) return '—';
  if (n >= 1e6) return `${(n/1e6).toFixed(2)}M`;
  if (n >= 1000) return `${(n/1000).toFixed(1)}k`;
  return n.toLocaleString();
}

/* Sessions list */
function CCList({ sessions, onSelect, modes, onToggleMode }) {
  const active = sessions.filter(s => s.state === 'active');
  const totalPending = sessions.reduce((a,s) => a + s.pending, 0);
  const agentCount = active.filter(s => (modes[s.id] ?? s.mode) === 'agent').length;

  return (
    <>
      <div className="v2-sess-hero">
        {[
          { label:'Active sessions',   value:String(active.length), sub:`of ${sessions.length} total`, spark:[2,2,3,3,2,3,4,3,4,3,4] },
          { label:'Agent mode',        value:String(agentCount),    sub:`of ${active.length} active`,  spark:[1,1,2,2,1,2,3,2,3,2,3] },
          { label:'Pending approvals', value:String(totalPending),  sub:totalPending > 0 ? 'awaiting' : 'none', color:totalPending > 0 ? 'var(--warn)' : undefined, spark:[0,0,1,0,2,1,2,2,1,2,2] },
          { label:'Messages total',    value:sessions.reduce((a,s)=>a+s.messageCount,0).toLocaleString(), sub:`across ${sessions.length} sessions`, spark:[20,34,44,51,30,48,66,71,58,63,80] },
        ].map((s, i) => <div key={i} className={`v2-c${i}`}><V2Stat {...s} delay={i*60} /></div>)}
      </div>

      <div className="v2-card">
        <table className="v2-tbl">
          <thead>
            <tr><th style={{width:28}}></th><th>Session</th><th>Mode</th><th>State</th><th>Activity</th><th>Pending</th><th>Decision</th><th style={{textAlign:'right'}}>Actions</th></tr>
          </thead>
          <tbody>
            {sessions.map(s => {
              const mode = modes[s.id] ?? s.mode;
              const lamp = s.state === 'ended' ? 'off' : s.pending > 0 ? 'warn' : 'ok';
              return (
                <tr key={s.id} style={{ cursor:'pointer' }} onClick={() => onSelect(s.id)}>
                  <td onClick={e=>e.stopPropagation()}><V2Dot status={lamp}/></td>
                  <td>
                    <div style={{ fontWeight:600, color:'var(--t1)', fontSize:13 }}>{s.displayName}</div>
                    <div className="v2-row-sub">{s.ide} · <span style={{fontFamily:'var(--mono)'}}>{s.id.slice(0,8)}</span></div>
                  </td>
                  <td onClick={e=>e.stopPropagation()}>
                    <button className={`v2-badge v2-badge-${mode==='agent'?'ok':'warn'}`} style={{cursor:'pointer',border:'none'}} onClick={() => onToggleMode(s.id, mode)}>{mode}</button>
                  </td>
                  <td><V2Badge kind={s.state==='active'?'acc':'mute'}>{s.state}</V2Badge></td>
                  <td>
                    <div style={{fontFamily:'var(--mono)',fontSize:12,color:'var(--t1)',fontWeight:600}}>{s.messageCount} msgs</div>
                    <div className="v2-row-sub">{ccRelTime(s.lastActivityAt)}</div>
                  </td>
                  <td>{s.pending > 0 ? <V2Badge kind="warn" dot>{s.pending}</V2Badge> : <span style={{color:'var(--t4)'}}>—</span>}</td>
                  <td>{s.needsDecision ? <V2Badge kind="warn" dot>decision</V2Badge> : <span style={{color:'var(--t4)'}}>—</span>}</td>
                  <td style={{textAlign:'right'}} onClick={e=>e.stopPropagation()}>
                    <button className="v2-btn v2-btn-ghost v2-btn-sm">{s.state==='active'?'End':'Resurrect'}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* Session detail */
function CCDetail({ onBack }) {
  const d = window.AM_DATA.claudeCode.detail;
  const [mode, setMode] = React.useState(d.mode);
  const [pendingDone, setPendingDone] = React.useState(false);

  return (
    <>
      <div className="v2-ph">
        <div className="v2-ph-left">
          <button className="v2-btn v2-btn-ghost v2-btn-sm" style={{marginBottom:10}} onClick={onBack}>← All sessions</button>
          <div className="v2-ph-title">{d.displayName}</div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginTop:5}}>
            <V2Badge kind={d.state==='active'?'acc':'mute'}>{d.state}</V2Badge>
            <span style={{fontFamily:'var(--mono)',fontSize:11.5,color:'var(--t3)'}}>{d.messageCount} msgs · {d.ide}</span>
          </div>
        </div>
        {d.state==='active' && <div className="v2-ph-actions"><button className="v2-btn v2-btn-danger v2-btn-sm">End session</button></div>}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 290px',gap:16}}>
        {/* Transcript */}
        <div className="v2-card" style={{display:'flex',flexDirection:'column',maxHeight:'calc(100vh - 265px)'}}>
          <div style={{padding:'10px 16px',borderBottom:'1px solid var(--b1)',flexShrink:0,display:'flex',alignItems:'center',gap:8,fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',color:'var(--t4)'}}>
            Transcript
            <span style={{marginLeft:'auto',fontFamily:'var(--mono)',textTransform:'none',letterSpacing:0,fontSize:10,color:'var(--t4)'}}>{d.transcript.length} events</span>
          </div>
          <div className="v2-thr-body" style={{flex:1,minHeight:0}}>
            {d.transcript.map((ev, i) => {
              if (ev.kind === 'mode_change') return (
                <div className="v2-msg-sys" key={i}><span className="ln"/><span>mode: {ev.from} → {ev.to}</span><span className="ln"/></div>
              );
              if (ev.kind === 'ask') return (
                <div key={i} style={{alignSelf:'flex-end',maxWidth:'78%',display:'flex',flexDirection:'column',alignItems:'flex-end',animation:`v2-card-in 220ms var(--ease) ${i*40}ms both`}}>
                  <div style={{display:'flex',gap:5,alignItems:'center',marginBottom:4}}>
                    <span style={{fontSize:9.5,color:'var(--t4)',fontFamily:'var(--mono)'}}>Claude Code</span>
                    <V2Badge kind={ev.state==='blocked'?'warn':'mute'}>{ev.intent}</V2Badge>
                    {ev.state==='blocked' && <V2Badge kind="warn" dot>blocked</V2Badge>}
                  </div>
                  <div className="v2-msg v2-msg-us">{ev.text}</div>
                </div>
              );
              if (ev.kind === 'answer') return (
                <div key={i} style={{alignSelf:'flex-start',maxWidth:'78%',animation:`v2-card-in 220ms var(--ease) ${i*40}ms both`}}>
                  <div style={{fontSize:9.5,color:'var(--t4)',fontFamily:'var(--mono)',marginBottom:4}}>{ev.source==='operator'?'Operator':'Agent'}</div>
                  <div className="v2-msg" style={ev.source==='operator'
                    ? {background:'var(--warn-d)',border:'1px solid oklch(0.82 0.14 75/0.25)',borderBottomLeftRadius:3,color:'var(--t1)',alignSelf:'flex-start'}
                    : {background:'var(--s1)',border:'1px solid var(--b1)',borderBottomLeftRadius:3,color:'var(--t1)',alignSelf:'flex-start'}}>{ev.text}</div>
                </div>
              );
              return null;
            })}
            {d.pending && !pendingDone && (
              <div className="v2-thinking"><div className="v2-thinking-dots"><span/><span/><span/></div><span>Awaiting your decision…</span></div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div style={{display:'flex',flexDirection:'column',gap:12,overflowY:'auto',maxHeight:'calc(100vh - 265px)'}}>
          <div className="v2-mini"><div className="v2-mini-h">Summary</div><div style={{fontSize:12,color:'var(--t2)',lineHeight:1.7}}>{d.summary}</div></div>
          {d.pending && !pendingDone && (
            <div className="v2-mini" style={{borderColor:'oklch(0.82 0.14 75/0.4)',background:'var(--warn-d)'}}>
              <div className="v2-mini-h"><V2Dot status="warn"/>Pending decision</div>
              <div style={{fontSize:12,color:'var(--t1)',lineHeight:1.65,marginBottom:10}}>{d.pending.question}</div>
              <div style={{display:'flex',gap:5}}>
                <button className="v2-btn v2-btn-pri v2-btn-sm" style={{flex:1,justifyContent:'center'}} onClick={()=>setPendingDone(true)}><IC.check/>Approve</button>
                <button className="v2-btn v2-btn-sm" style={{flex:1,justifyContent:'center'}}>Edit</button>
                <button className="v2-btn v2-btn-sm" onClick={()=>setPendingDone(true)}><IC.x/></button>
              </div>
            </div>
          )}
          <div className="v2-mini">
            <div className="v2-mini-h">Intel</div>
            <V2KV entries={[
              ['agent model', d.agentModel],['cc model', d.resolvedModel],
              ['tokens in', fmtTok(d.tokens.input)],['tokens out', fmtTok(d.tokens.output)],
              ['cache read', fmtTok(d.tokens.cacheRead)],['cache write', fmtTok(d.tokens.cacheCreate)],
            ]}/>
          </div>
          <div className="v2-mini">
            <div className="v2-mini-h">Mode</div>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <V2Sw on={mode==='agent'} onToggle={()=>setMode(m=>m==='agent'?'manual':'agent')}/>
              <div>
                <div style={{fontWeight:600,color:'var(--t1)',fontSize:13}}>{mode==='agent'?'Agent':'Manual'}</div>
                <div style={{fontFamily:'var(--mono)',fontSize:10.5,color:'var(--t3)',marginTop:2}}>{mode==='agent'?'Replies automatically':'Operator reviews every reply'}</div>
              </div>
            </div>
          </div>
          <div className="v2-mini">
            <div className="v2-mini-h">Session</div>
            <V2KV entries={[['id',d.id],['ide',d.ide],['workspace',d.workspace],['agent',d.sessionId],['created',new Date(d.createdAt).toLocaleString()]]}/>
          </div>
        </div>
      </div>
    </>
  );
}

function V2ClaudeCodeScreen({ sessionId, onSelectSession }) {
  const [modes, setModes] = React.useState({});
  const sessions = window.AM_DATA.claudeCode.sessions;
  return (
    <div className="v2-screen">
      <div className="v2-ph">
        <div className="v2-ph-left">
          <div className="v2-ph-title">Claude Code</div>
          <div className="v2-ph-sub">{sessions.length} sessions · {sessions.filter(s=>s.state==='active').length} active</div>
        </div>
        <div className="v2-ph-actions">
          <button className="v2-btn v2-btn-pri"><IC.plus />Connect IDE</button>
        </div>
      </div>
      {sessionId
        ? <CCDetail onBack={() => onSelectSession(null)} />
        : <CCList sessions={sessions} onSelect={onSelectSession} modes={modes}
            onToggleMode={(id,cur) => setModes(p=>({...p,[id]:cur==='agent'?'manual':'agent'}))} />}
    </div>
  );
}

Object.assign(window, { V2ClaudeCodeScreen });


/* ── v2-reviews.jsx ── */
function rvRel(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime(), abs = Math.abs(diff);
  const m = Math.round(abs/60000), h = Math.round(m/60), d = Math.round(h/24);
  const sfx = diff >= 0 ? ' ago' : ' from now';
  if (abs < 60000) return 'just now';
  if (m < 60) return `${m}m${sfx}`;
  if (h < 48) return `${h}h${sfx}`;
  return `${d}d${sfx}`;
}

const STATUS_KIND = { idle:'mute', queued:'info', running:'ok', awaiting_ack:'warn', skipped:'mute', failed:'err' };
const SEV_KIND    = { critical:'err', high:'warn', medium:'info', low:'mute' };
const TRIAGE_KIND = { new:'acc', needs_attention:'warn', actionable:'ok', dismissed:'mute', resolved:'mute' };
const TRIAGE_OPS  = [
  { v:'new', l:'New' }, { v:'needs_attention', l:'Needs attention' },
  { v:'actionable', l:'Actionable' }, { v:'dismissed', l:'Dismissed' }, { v:'resolved', l:'Resolved' },
];

function ReviewsProjects() {
  const { projects, worker, scanRoots } = window.AM_DATA.reviews;
  const [showAdd, setShowAdd] = React.useState(false);
  const [newPath, setNewPath] = React.useState('');
  const [enabled, setEnabled] = React.useState({});

  return (
    <>
      {/* Worker strip */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,padding:'10px 14px',background:'var(--s1)',border:'1px solid var(--b1)',borderRadius:'var(--r2)',fontSize:12}}>
        <V2Dot status={worker.current ? 'ok' : 'off'} />
        <span style={{color:'var(--t2)'}}>
          Worker:{' '}
          {worker.current
            ? <span style={{fontFamily:'var(--mono)',color:'var(--ok)'}}>running {worker.current}</span>
            : <span style={{color:'var(--t3)'}}>idle</span>}
          {worker.queue.length > 0 && <span style={{fontFamily:'var(--mono)',color:'var(--t4)',marginLeft:8}}>queued: {worker.queue.join(', ')}</span>}
        </span>
        <div style={{display:'flex',gap:4,flexWrap:'wrap',marginLeft:4}}>
          {scanRoots.map(r => <span key={r} style={{fontFamily:'var(--mono)',fontSize:10.5,padding:'2px 8px',background:'var(--b1)',borderRadius:4,color:'var(--t2)'}}>{r}</span>)}
        </div>
        <div style={{marginLeft:'auto',display:'flex',gap:5}}>
          <button className="v2-btn v2-btn-sm" onClick={() => { setShowAdd(v=>!v); setNewPath(''); }}>
            {showAdd ? 'Cancel' : <><IC.plus />Add project</>}
          </button>
          <button className="v2-btn v2-btn-sm"><IC.refresh />Rescan</button>
        </div>
      </div>

      {showAdd && (
        <div style={{display:'flex',gap:8,marginBottom:14,padding:'10px 14px',background:'var(--s1)',border:'1px solid var(--b1)',borderRadius:'var(--r2)'}}>
          <input type="text" value={newPath} onChange={e=>setNewPath(e.target.value)}
            placeholder="Absolute path (e.g. /Users/you/code/my-repo)"
            style={{flex:1,background:'var(--bg)',border:'1px solid var(--b2)',borderRadius:'var(--r1)',padding:'6px 10px',fontSize:12,color:'var(--t1)',fontFamily:'var(--mono)'}}/>
          <button className="v2-btn v2-btn-pri v2-btn-sm" disabled={!newPath.trim()}><IC.check />Add</button>
        </div>
      )}

      <div className="v2-card">
        <table className="v2-tbl">
          <thead><tr><th>Project</th><th>Status</th><th>Last run</th><th>Error</th><th>Eligible</th><th>Enabled</th><th style={{textAlign:'right'}}>Actions</th></tr></thead>
          <tbody>
            {projects.map(p => {
              const isOn = enabled[p.id] !== undefined ? enabled[p.id] : p.enabled;
              return (
                <tr key={p.id}>
                  <td>
                    <div style={{fontWeight:600,color:'var(--t1)'}}>{p.name}</div>
                    <div className="v2-row-sub">{p.path}</div>
                  </td>
                  <td>{p.missing ? <V2Badge kind="err">missing</V2Badge> : <V2Badge kind={STATUS_KIND[p.status]||'mute'}>{p.status.replace('_',' ')}</V2Badge>}</td>
                  <td>
                    <div style={{fontSize:12,color:'var(--t2)'}}>{rvRel(p.lastRunAt)}</div>
                    {p.lastReportDate && <div className="v2-row-sub">report {p.lastReportDate}</div>}
                  </td>
                  <td style={{maxWidth:200}}>
                    {p.status==='failed' && p.lastError
                      ? <span style={{fontSize:11,color:'var(--err)',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={p.lastError}>{p.lastError}</span>
                      : <span style={{color:'var(--t4)'}}>—</span>}
                  </td>
                  <td style={{fontFamily:'var(--mono)',fontSize:11.5,color:'var(--t2)'}}>
                    {p.eligibleAt ? rvRel(p.eligibleAt) : p.status==='awaiting_ack' ? <span style={{color:'var(--warn)'}}>awaiting ack</span> : 'now'}
                  </td>
                  <td><V2Sw on={isOn} onToggle={()=>setEnabled(prev=>({...prev,[p.id]:!isOn}))}/></td>
                  <td style={{textAlign:'right'}}>
                    <div style={{display:'flex',gap:5,justifyContent:'flex-end'}}>
                      {!p.missing && p.status!=='running' && p.status!=='queued' && (
                        <button className="v2-btn v2-btn-sm" style={{background:'var(--info-d)',color:'var(--info)',borderColor:'transparent'}}>Run now</button>
                      )}
                      {p.status==='awaiting_ack' && (
                        <button className="v2-btn v2-btn-sm" style={{background:'var(--warn-d)',color:'var(--warn)',borderColor:'transparent'}}>Acknowledge</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ReviewsInbox() {
  const items = window.AM_DATA.reviews.inbox;
  const [filters, setFilters] = React.useState(new Set(['new','needs_attention','actionable']));
  const [selected, setSelected] = React.useState(new Set());
  const [overrides, setOverrides] = React.useState({});
  const key = i => `${i.projectId}::${i.reportDate}`;
  const triage = i => overrides[key(i)] ?? i.triageState;
  const visible = items.filter(i => filters.has(triage(i)));
  const toggleF = f => setFilters(p => { const n=new Set(p); n.has(f)?n.delete(f):n.add(f); return n; });
  const bulkSet = st => {
    const tgts = visible.filter(i => selected.has(key(i)));
    setOverrides(p => { const n={...p}; tgts.forEach(i=>{n[key(i)]=st;}); return n; });
    setSelected(new Set());
  };

  return (
    <>
      <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:6,marginBottom:14}}>
        <span style={{fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',color:'var(--t4)'}}>Filter:</span>
        {TRIAGE_OPS.map(f => (
          <button key={f.v} onClick={()=>toggleF(f.v)} className="v2-btn v2-btn-sm"
            style={filters.has(f.v)
              ? {background:'var(--ad)',color:'var(--a2)',borderColor:'transparent'}
              : {background:'var(--b1)',borderColor:'transparent',color:'var(--t3)'}}>
            {f.l}
          </button>
        ))}
        {selected.size > 0 && (
          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:7}}>
            <span style={{fontSize:11.5,color:'var(--t3)'}}>{selected.size} selected</span>
            <button className="v2-btn v2-btn-sm" style={{background:'var(--ok-d)',color:'var(--ok)',borderColor:'transparent'}} onClick={()=>bulkSet('actionable')}>Actionable</button>
            <button className="v2-btn v2-btn-sm" onClick={()=>bulkSet('dismissed')}>Dismiss</button>
            <button className="v2-btn v2-btn-sm" onClick={()=>bulkSet('resolved')}>Resolved</button>
          </div>
        )}
      </div>
      {visible.length === 0
        ? <div className="v2-mini" style={{textAlign:'center',padding:'40px 24px',color:'var(--t3)'}}>No reviews match the current filter.</div>
        : (
          <div className="v2-card">
            <table className="v2-tbl">
              <thead><tr>
                <th style={{width:36}}><input type="checkbox" checked={selected.size===visible.length&&visible.length>0} onChange={()=>selected.size===visible.length?setSelected(new Set()):setSelected(new Set(visible.map(key)))}/></th>
                <th>Project</th><th>Date</th><th>Severity</th><th>Triage</th><th>Ideas</th><th style={{textAlign:'right'}}>Open</th>
              </tr></thead>
              <tbody>
                {visible.map(i => {
                  const k = key(i), tr = triage(i);
                  return (
                    <tr key={k}>
                      <td><input type="checkbox" checked={selected.has(k)} onChange={e=>{setSelected(p=>{const n=new Set(p);e.target.checked?n.add(k):n.delete(k);return n;});}}/></td>
                      <td style={{fontWeight:600,color:'var(--t1)'}}>{i.projectName}</td>
                      <td style={{fontFamily:'var(--mono)',fontSize:11}}>{i.reportDate}</td>
                      <td><V2Badge kind={SEV_KIND[i.severity]||'mute'}>{i.severity}</V2Badge></td>
                      <td><V2Badge kind={TRIAGE_KIND[tr]||'mute'}>{tr.replace('_',' ')}</V2Badge></td>
                      <td style={{fontFamily:'var(--mono)',color:'var(--t2)'}}>{i.ideasCount}</td>
                      <td style={{textAlign:'right'}}><button className="v2-btn v2-btn-ghost v2-btn-sm" style={{color:'var(--a2)'}}>Open <IC.right/></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </>
  );
}

function V2ReviewsScreen({ view, onChangeView }) {
  const newCount = window.AM_DATA.reviews.inbox.filter(i => i.triageState === 'new').length;
  return (
    <div className="v2-screen">
      <div className="v2-ph">
        <div className="v2-ph-left">
          <div className="v2-ph-title">Reviews</div>
          <div className="v2-ph-sub">{view==='projects' ? 'Agent reviews each project daily as a product manager.' : 'All reports across projects, ranked by triage state.'}</div>
        </div>
        <div className="v2-ph-actions">
          <div style={{display:'flex',gap:2,padding:3,background:'var(--s1)',border:'1px solid var(--b1)',borderRadius:'var(--r2)'}}>
            {[{id:'projects',l:'Projects'},{id:'inbox',l:'Inbox'}].map(t => (
              <button key={t.id} onClick={()=>onChangeView(t.id)}
                style={{padding:'4px 14px',borderRadius:'var(--r1)',fontSize:12.5,fontWeight:500,background:view===t.id?'var(--s2)':'transparent',color:view===t.id?'var(--t1)':'var(--t3)',position:'relative',transition:'background 100ms,color 100ms'}}>
                {t.l}
                {t.id==='inbox' && newCount > 0 && (
                  <span style={{position:'absolute',top:-5,right:-5,width:15,height:15,borderRadius:'50%',background:'var(--a)',color:'var(--afg)',fontSize:9,fontWeight:700,display:'grid',placeItems:'center',boxShadow:'0 0 8px var(--ag)'}}>{newCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      {view==='projects' ? <ReviewsProjects/> : <ReviewsInbox/>}
    </div>
  );
}

Object.assign(window, { V2ReviewsScreen });


/* ── v2-app.jsx ── */
const V2_SCREENS = [
  { id:'overview',      l:'Overview'      },
  { id:'conversations', l:'Conversations' },
  { id:'claude-code',   l:'Claude Code'   },
  { id:'reviews',       l:'Reviews'       },
  { id:'sessions',      l:'Sessions'      },
  { id:'agents',        l:'Agents'        },
];

function TweaksPanel({ open, setOpen, screen, setScreen }) {
  if (!open) return null;
  return (
    <div className="v2-tweaks">
      <div className="v2-tweaks-hd">
        <IC.sliders />
        <span>Tweaks</span>
        <button className="v2-btn v2-btn-ghost v2-btn-sm" style={{ padding:'2px 5px' }} onClick={() => {
          setOpen(false);
          window.parent.postMessage({ type:'__edit_mode_dismissed' }, '*');
        }}><IC.x /></button>
      </div>
      <div className="v2-tweaks-body">
        <div>
          <div className="v2-tweaks-label">Navigate to screen</div>
          <div className="v2-screen-list">
            {V2_SCREENS.map(s => (
              <button key={s.id} className={`v2-screen-opt${screen===s.id?' sel':''}`} onClick={() => setScreen(s.id)}>
                {s.l}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const saved = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const [screen,  setScreen]  = React.useState(saved('v2.screen') || 'overview');
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  const [selConv,  setSelConv]  = React.useState('c1');
  const [ccSess,   setCcSess]   = React.useState(null);
  const [rvView,   setRvView]   = React.useState('projects');
  const [agToggles,setAgToggles]= React.useState({});

  React.useEffect(() => { try { localStorage.setItem('v2.screen', screen); } catch {} }, [screen]);

  React.useEffect(() => {
    const h = (e) => {
      if (!e.data) return;
      if (e.data.type === '__activate_edit_mode')   setTweaksOpen(true);
      if (e.data.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', h);
    window.parent.postMessage({ type:'__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', h);
  }, []);

  const CORE = ['overview','conversations','claude-code','reviews','sessions','agents'];

  return (
    <div className="v2-app">
      <V2Sidebar active={screen} onNav={setScreen} />

      <div className="v2-main">
        <V2Header screen={screen} />

        <div className="v2-content" data-screen={screen}>
          {screen === 'overview'      && <V2OverviewScreen key="overview" />}
          {screen === 'conversations' && <V2ConvsScreen key="convs" selectedId={selConv} onSelect={setSelConv} />}
          {screen === 'claude-code'   && <V2ClaudeCodeScreen key="cc" sessionId={ccSess} onSelectSession={setCcSess} />}
          {screen === 'reviews'       && <V2ReviewsScreen key="rv" view={rvView} onChangeView={setRvView} />}
          {screen === 'sessions'      && <V2SessionsScreen key="sess" />}
          {screen === 'agents'        && <V2AgentsScreen key="agents" agentToggles={agToggles} onToggle={id => setAgToggles(p => {
            const cur = p[id] !== undefined ? p[id] : window.AM_DATA.agents.find(a=>a.id===id)?.on;
            return {...p,[id]:!cur};
          })} />}
          {!CORE.includes(screen) && (
            <div className="v2-screen" style={{padding:'60px 0',textAlign:'center',color:'var(--t3)'}}>
              <div style={{fontSize:15,color:'var(--t1)',marginBottom:6}}>Screen not in prototype scope</div>
              <button className="v2-btn" style={{marginTop:16}} onClick={()=>setScreen('overview')}>← Back to Overview</button>
            </div>
          )}
        </div>
      </div>

      <TweaksPanel open={tweaksOpen} setOpen={setTweaksOpen} screen={screen} setScreen={setScreen} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);


