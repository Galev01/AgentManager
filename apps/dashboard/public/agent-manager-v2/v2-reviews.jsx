/* v2-reviews.jsx */

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
