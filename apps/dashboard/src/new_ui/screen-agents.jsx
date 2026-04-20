/* Agents — config cards */

const AgentsScreen = () => {
  const agents = window.DATA.agents;
  return (
    <>
      <div className="page-h">
        <div>
          <div className="page-title">Agents</div>
          <div className="page-sub">6 agents · 5 enabled · 1 sandboxed</div>
        </div>
        <div className="page-actions">
          <button className="btn"><I.filter/>model: any</button>
          <button className="btn btn-pri"><I.plus/>New agent</button>
        </div>
      </div>

      <div style={{height: 20}}/>

      <div className="agent-grid">
        {agents.map(a => (
          <div key={a.id} className={`agent-card ${a.primary ? "primary" : ""}`}>
            <div className="agent-toggle"><Switch on={a.on}/></div>
            <div className="agent-card-h">
              <div className="agent-av" style={{background: a.color}}>{a.av}</div>
              <div style={{minWidth: 0, flex: 1, paddingRight: 40}}>
                <div className="agent-n">{a.name}</div>
                <div className="agent-id">id={a.id} · model={a.model}</div>
              </div>
            </div>
            <div className="agent-desc">{a.desc}</div>

            <div className="agent-caps">
              {a.caps.slice(0, 4).map(c => <Badge key={c} kind="mute">{c}</Badge>)}
              {a.caps.length > 4 && <Badge kind="mute">+{a.caps.length - 4}</Badge>}
            </div>

            <div className="agent-stats">
              <div className="agent-stat">
                <div className="l">Msgs 24h</div>
                <div className="v">{a.msgs24}</div>
              </div>
              <div className="agent-stat">
                <div className="l">p50</div>
                <div className="v">{a.p50}</div>
              </div>
              <div className="agent-stat">
                <div className="l">Confidence</div>
                <div className="v">{typeof a.confidence === "number" ? a.confidence + "%" : a.confidence}</div>
              </div>
            </div>

            {a.primary && (
              <div style={{
                position: "absolute", top: 14, right: 58,
                fontSize: 10, fontWeight: 600, color: "var(--accent)",
                textTransform: "uppercase", letterSpacing: "0.08em"
              }}>Primary</div>
            )}
          </div>
        ))}
      </div>

      <div style={{height: "var(--row-gap)"}}/>

      <div className="mini">
        <div className="mini-h">Routing rules · what directs traffic to which agent</div>
        <table className="tbl" style={{marginTop: -4}}>
          <thead>
            <tr><th>#</th><th>Match</th><th>Condition</th><th>→ Agent</th><th>Handoff</th><th style={{textAlign: "right"}}>Hit 24h</th></tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono">1</td>
              <td><Badge kind="info">wa.group</Badge></td>
              <td className="mono" style={{fontSize: 11.5, color: "var(--text-dim)"}}>channel == "whatsapp" && chat.type == "group"</td>
              <td><Badge kind="acc">concierge</Badge></td>
              <td className="mono" style={{fontSize: 11, color: "var(--text-faint)"}}>→ human if @mention</td>
              <td style={{textAlign: "right"}} className="mono pri">108</td>
            </tr>
            <tr>
              <td className="mono">2</td>
              <td><Badge kind="info">inbound.dm</Badge></td>
              <td className="mono" style={{fontSize: 11.5, color: "var(--text-dim)"}}>channel == "whatsapp" && chat.type == "dm"</td>
              <td><Badge kind="acc">concierge</Badge></td>
              <td className="mono" style={{fontSize: 11, color: "var(--text-faint)"}}>→ support_hub if topic:billing</td>
              <td style={{textAlign: "right"}} className="mono pri">734</td>
            </tr>
            <tr>
              <td className="mono">3</td>
              <td><Badge kind="info">support.keyword</Badge></td>
              <td className="mono" style={{fontSize: 11.5, color: "var(--text-dim)"}}>msg ~ /refund|invoice|cancel/i</td>
              <td><Badge kind="acc">support_hub</Badge></td>
              <td className="mono" style={{fontSize: 11, color: "var(--text-faint)"}}>— </td>
              <td style={{textAlign: "right"}} className="mono pri">312</td>
            </tr>
            <tr>
              <td className="mono">4</td>
              <td><Badge kind="err">yt.livechat</Badge></td>
              <td className="mono" style={{fontSize: 11.5, color: "var(--text-dim)"}}>channel == "youtube" && kind == "livechat"</td>
              <td><Badge kind="acc">yt_mod</Badge></td>
              <td className="mono" style={{fontSize: 11, color: "var(--text-faint)"}}>→ concierge if flagged</td>
              <td style={{textAlign: "right"}} className="mono pri">104</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
};
