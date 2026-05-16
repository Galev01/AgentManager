/* v2-cc.jsx — Claude Code screen */

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
