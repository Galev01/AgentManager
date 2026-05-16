/* v2-app.jsx */

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
