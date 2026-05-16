/* v2-agents.jsx */

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
