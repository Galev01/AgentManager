/* Conversations — 3-pane live thread viewer with routing inspector */

const ConversationsScreen = () => {
  const list = window.DATA.conversations;
  const t = window.DATA.activeThread;

  return (
    <>
      <div className="page-h">
        <div>
          <div className="page-title">Conversations</div>
          <div className="page-sub">10 active threads · 3 awaiting review · live</div>
        </div>
        <div className="page-actions">
          <button className="btn"><I.filter/>agent: any</button>
          <button className="btn"><I.filter/>status: any</button>
          <button className="btn"><I.sparkles/>Pause all agents</button>
        </div>
      </div>

      <div style={{ height: 16 }}/>

      <div className="conv">
        {/* LEFT: list */}
        <div className="conv-pane">
          <div className="conv-pane-h">
            <div className="conv-pane-t">Threads</div>
            <Badge kind="mute">10</Badge>
            <div style={{ marginLeft: "auto" }}>
              <button className="btn" style={{padding: "3px 7px"}}><I.search/></button>
            </div>
          </div>
          <div className="conv-pane-body">
            {list.map(c => (
              <div key={c.id} className={`conv-list-item ${c.selected ? "sel" : ""}`}>
                <Avatar color={c.color} text={c.avatar} size={32}/>
                <div className="conv-item-main">
                  <div className="conv-item-n">{c.name}</div>
                  <div className="conv-item-p">
                    {c.status === "awaiting_review" && <span className="dot-lamp warn" style={{width: 6, height: 6, margin: 0, boxShadow: "none"}}/>}
                    {c.snippet}
                  </div>
                </div>
                <div>
                  <div className="conv-item-t">{c.lastAt}</div>
                  {c.unread ? <div className="conv-item-badge">{c.unread}</div> : <div className="conv-item-badge mono" style={{color: "var(--text-faint)", fontWeight: 400}}>{c.agent}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CENTER: thread */}
        <div className="conv-pane">
          <div className="thr-head">
            <Avatar color={t.color} text={t.avatar} size={36}/>
            <div>
              <div className="n">{t.name}</div>
              <div className="s mono">
                <span>{t.phone}</span>
                <span>·</span>
                <span>session={t.session}</span>
                <span>·</span>
                <span>brain={t.brainId}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn" style={{padding: "4px 8px"}}><I.pause/></button>
              <button className="btn" style={{padding: "4px 8px"}}><I.external/></button>
              <button className="btn" style={{padding: "4px 8px"}}><I.dots/></button>
            </div>
          </div>

          <div className="thr-body">
            {t.messages.map((m, i) => {
              if (m.kind === "sys") return (
                <div className="msg-sys" key={i}>
                  <span className="line"/>
                  <span dangerouslySetInnerHTML={{__html: m.text}}/>
                  <span className="line"/>
                </div>
              );
              return (
                <div className={`msg ${m.kind}`} key={i}>
                  <div>{m.text}</div>
                  <div className="meta mono">
                    <span>{m.t}</span>
                    {m.by && <><span>·</span><span>agent={m.by}</span></>}
                    {m.lat && <><span>·</span><span>{m.lat}</span></>}
                  </div>
                </div>
              );
            })}
            <div className="thinking">
              <div className="dots"><span/><span/><span/></div>
              <span>{t.thinking}</span>
            </div>
          </div>

          <div className="thr-compose">
            <button className="btn" style={{padding: "5px 8px"}}><I.attach/></button>
            <div className="tinput">Take over and send manually…</div>
            <button className="btn" style={{padding: "5px 8px"}}><I.sparkles/></button>
            <button className="btn btn-pri"><I.send/>Send</button>
          </div>
        </div>

        {/* RIGHT: inspector */}
        <div className="conv-pane">
          <div className="conv-pane-h">
            <div className="conv-pane-t">Inspector</div>
            <Badge kind="acc" dot>live</Badge>
          </div>
          <div className="conv-pane-body">
            <div className="rp-sec">
              <div className="rp-h">Pending review</div>
              <div style={{
                padding: 10, background: "var(--warn-dim)", border: "1px solid oklch(0.80 0.14 75 / 0.3)",
                borderRadius: 6, fontSize: 12, color: "var(--text)", lineHeight: 1.5
              }}>
                {t.pendingReview.draft}
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                {t.pendingReview.flags.map(f => <Badge key={f} kind="warn">{f}</Badge>)}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <button className="btn btn-pri" style={{flex: 1, justifyContent: "center"}}><I.check/>Approve</button>
                <button className="btn" style={{flex: 1, justifyContent: "center"}}>Edit</button>
                <button className="btn" style={{padding: "6px 8px"}}><I.x/></button>
              </div>
            </div>

            <div className="rp-sec">
              <div className="rp-h">Routing</div>
              <div className="route">
                <span className="chip">inbound.dm</span>
                <span className="arr">→</span>
                <span className="chip">rule #2</span>
                <span className="arr">→</span>
                <span className="chip active">concierge</span>
              </div>
              <div className="route">
                <span className="chip">brain.lookup</span>
                <span className="arr">·</span>
                <span className="chip">hit=1</span>
                <span className="arr">·</span>
                <span className="chip">12ms</span>
              </div>
            </div>

            <div className="rp-sec">
              <div className="rp-h">Contact</div>
              <KV entries={[
                ["phone", t.phone],
                ["name",  t.name],
                ["brain", t.brainId],
                ["since", "2024-11-02"],
                ["msgs",  "148"],
                ["plan",  "Pro · renews 6d"],
              ]}/>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 10 }}>
                {t.tags.map(tag => <Badge key={tag} kind="mute">{tag}</Badge>)}
              </div>
            </div>

            <div className="rp-sec">
              <div className="rp-h">Brain notes · 3</div>
              <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.55 }}>
                <div style={{ padding: "6px 0" }}>• prefers pdf over paste · <span className="mono" style={{color: "var(--text-faint)", fontSize: 10.5}}>confirmed 2×</span></div>
                <div style={{ padding: "6px 0", borderTop: "1px solid var(--border)" }}>• works in PT timezone; don't message before 10am PT</div>
                <div style={{ padding: "6px 0", borderTop: "1px solid var(--border)" }}>• asked about enterprise tier on mar 12 — not ready to upgrade</div>
              </div>
            </div>

            <div className="rp-sec">
              <div className="rp-h">Tools used in thread</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <Badge kind="info">brain.lookup</Badge>
                <Badge kind="info">billing.read</Badge>
                <Badge kind="info">links.unfurl</Badge>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
