/* Sessions — runtime table */

const SessionsScreen = () => {
  const sessions = window.DATA.sessions;
  // fabricate uptime pattern for each session
  const patterns = {
    ok:   "gggggggggggggggggggggggg",
    warn: "ggggggggggggggggwwwgggw",
    err:  "gggggggggeeeeeeeeeeeeeee",
    off:  "oooooooooooooooooooooooo"
  };

  return (
    <>
      <div className="page-h">
        <div>
          <div className="page-title">Sessions</div>
          <div className="page-sub">5 runtime sessions · 2 WhatsApp · 2 YouTube · 1 stopped</div>
        </div>
        <div className="page-actions">
          <button className="btn"><I.refresh/>Refresh</button>
          <button className="btn btn-pri"><I.plus/>New session</button>
        </div>
      </div>

      <div className="sess-hero" style={{marginTop: 20}}>
        <StatCard label="Running"    value="3" sub="of 5"           spark={[3,3,4,3,3,4,3,3,3,3,3]}/>
        <StatCard label="Heartbeat p50" value="48" unit="ms" sub="stable" spark={[42,40,45,48,44,46,50,48,46,44,48]}/>
        <StatCard label="Msgs / 24h"   value="1,284" sub="+18.2%" accent="oklch(0.76 0.17 150)" spark={[20,34,44,51,30,48,66,71,58,63,80]}/>
        <StatCard label="Crash loops"  value="1" sub="yt.relay.shorts" accent="oklch(0.68 0.20 25)" spark={[0,0,0,0,1,1,1,0,0,1,1]}/>
      </div>

      <div className="card" style={{overflow: "hidden"}}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{width: 30}}></th>
              <th>Session</th>
              <th>Channel</th>
              <th>Agent</th>
              <th>Uptime · 24h</th>
              <th>Heartbeat</th>
              <th style={{textAlign: "right"}}>Msgs 24h</th>
              <th>Started</th>
              <th style={{width: 40}}></th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => (
              <tr key={s.id}>
                <td><span className={`dot-lamp ${s.status}`}/></td>
                <td>
                  <div className="pri mono" style={{fontSize: 12.5}}>{s.id}</div>
                  <div className="sess-row-sub">{s.device}</div>
                </td>
                <td>
                  <Badge kind={s.kind === "whatsapp" ? "ok" : "err"}>{s.kind}</Badge>
                  <div className="sess-row-sub">{s.phone}</div>
                </td>
                <td>
                  {s.agent === "—" ? <span style={{color: "var(--text-faint)"}}>—</span> : <Badge kind="acc">{s.agent}</Badge>}
                </td>
                <td>
                  <UptimeBar pattern={patterns[s.status]}/>
                  <span className="mono" style={{marginLeft: 8, fontSize: 11.5, color: "var(--text)"}}>{s.uptime === "—" ? "—" : s.uptime + "%"}</span>
                </td>
                <td>
                  <span className="mono" style={{fontSize: 12}}>{s.heartbeat}</span>
                </td>
                <td style={{textAlign: "right"}} className="mono pri">{s.msgs24.toLocaleString()}</td>
                <td className="mono" style={{fontSize: 11.5, color: "var(--text-muted)"}}>{s.started}</td>
                <td><button className="btn" style={{padding: "3px 6px"}}><I.dots/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--row-gap)", marginTop: "var(--row-gap)"}}>
        <div className="mini">
          <div className="mini-h"><span className="dot-lamp err" style={{margin: 0}}/>Crash loop · yt.relay.shorts</div>
          <div style={{fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55, marginBottom: 10}}>
            Session has restarted <b style={{color: "var(--text)"}}>4 times in the last 14 minutes</b>. Last exit: <span className="mono" style={{color: "var(--err)"}}>ECONNRESET from youtube chat endpoint</span>.
          </div>
          <div style={{display: "flex", gap: 6}}>
            <button className="btn btn-pri"><I.play/>Restart once</button>
            <button className="btn"><I.pause/>Pause auto-restart</button>
            <button className="btn">View logs</button>
          </div>
        </div>
        <div className="mini">
          <div className="mini-h">Scheduled jobs · next 24h</div>
          <div style={{display: "flex", flexDirection: "column", gap: 4}}>
            {[
              ["02:00", "nightly.brain-compact",   "scribe",    "daily"],
              ["06:00", "session.health-check",    "sentinel",  "6h"],
              ["09:30", "backup.brain-snapshot",   "system",    "daily"],
              ["14:00", "yt.relay.reauth",         "yt_mod",    "12h"],
            ].map((r, i) => (
              <div key={i} style={{display: "grid", gridTemplateColumns: "50px 1fr auto auto", gap: 10, alignItems: "center", padding: "7px 0", borderTop: i ? "1px solid var(--border)" : "none"}}>
                <span className="mono" style={{color: "var(--text-faint)", fontSize: 11.5}}>{r[0]}</span>
                <span className="mono" style={{color: "var(--text)", fontSize: 12}}>{r[1]}</span>
                <Badge kind="mute">{r[2]}</Badge>
                <span className="mono" style={{fontSize: 10.5, color: "var(--text-faint)"}}>{r[3]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};
