/* v2-convs.jsx */

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
