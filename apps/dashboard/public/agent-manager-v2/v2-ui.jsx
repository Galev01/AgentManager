/* v2-ui.jsx — Icons, hooks, primitives, Sidebar, Header */

/* ── Icons ── */
const IC = {
  home:     ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1z"/><path d="M9 21V12h6v9"/></svg>,
  code:     ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  review:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
  agents:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>,
  sessions: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
  chat:     ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  brain:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5a3 3 0 00-3 3c0 .7.2 1.3.6 1.8A3 3 0 006 12a3 3 0 003 3h6a3 3 0 003-3 3 3 0 00-3.6-2.9c.4-.5.6-1.1.6-1.8A3 3 0 0012 5z"/><path d="M9 15v3M15 15v3"/></svg>,
  logs:     ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  settings: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  filter:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  refresh:  ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>,
  plus:     ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  sparkles: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M5 17l.75 2.25L8 20l-2.25.75L5 23l-.75-2.25L2 20l2.25-.75L5 17z"/></svg>,
  dots:     ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>,
  check:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  x:        ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  right:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  send:     ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  search:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  pause:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  play:     ()=><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  attach:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>,
  external: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  sliders:  ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>,
  bolt:     ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
};

/* ── Counter hook ── */
function useCount(target, duration = 700, delay = 0) {
  const num = parseFloat(String(target).replace(/[^0-9.]/g, '')) || 0;
  const [val, setVal] = React.useState(0);
  React.useEffect(() => {
    if (num === 0) { setVal(0); return; }
    const timer = setTimeout(() => {
      const t0 = performance.now();
      const tick = (ts) => {
        const p = Math.min((ts - t0) / duration, 1);
        const e = 1 - Math.pow(1 - p, 3);
        setVal(num * e);
        if (p < 1) requestAnimationFrame(tick); else setVal(num);
      };
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(timer);
  }, [num, duration, delay]);
  return val;
}

/* ── Sparkline with draw animation ── */
function V2Spark({ data, color = "var(--a)", height = 36 }) {
  const pathRef = React.useRef(null);
  const [animated, setAnimated] = React.useState(false);
  const [pathLen, setPathLen] = React.useState(500);

  React.useEffect(() => {
    if (pathRef.current) {
      const len = pathRef.current.getTotalLength();
      setPathLen(len);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimated(true)));
    }
  }, [JSON.stringify(data)]);

  if (!data || data.length < 2) return null;
  const W = 200, H = height;
  const max = Math.max(...data), min = Math.min(...data), rng = max - min || 1;
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - ((v - min) / rng) * (H - 6) - 3
  }));
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${color.replace(/[^a-z]/gi,'')}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W} ${H} L0 ${H} Z`} fill={`url(#sg-${color.replace(/[^a-z]/gi,'')})`} />
      <path ref={pathRef} d={d} fill="none" stroke={color} strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round"
        style={{
          strokeDasharray: pathLen,
          strokeDashoffset: animated ? 0 : pathLen,
          transition: animated ? 'stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1)' : 'none',
        }}
      />
    </svg>
  );
}

/* ── Stat card ── */
function V2Stat({ label, value, sub, unit, spark, color, delay = 0 }) {
  const num = parseFloat(String(value).replace(/[^0-9.]/g, '')) || 0;
  const counted = useCount(num, 700, delay);
  const hasDecimal = String(value).includes('.');
  const decimals = hasDecimal ? String(value).split('.')[1].length : 0;
  const display = hasDecimal
    ? counted.toFixed(decimals)
    : counted > 999 ? Math.round(counted).toLocaleString() : Math.round(counted).toString();

  const barColor = color || 'var(--a)';
  return (
    <div className="v2-stat" style={{ '--accent-bar': barColor }}>
      <div className="v2-stat-label">{label}</div>
      <div className="v2-stat-value">
        {display}
        {unit && <span className="v2-stat-unit">{unit}</span>}
      </div>
      {sub && <div className="v2-stat-sub">{sub}</div>}
      {spark && <div className="v2-stat-spark"><V2Spark data={spark} color={barColor} height={36} /></div>}
      <div className="v2-stat-bar" />
    </div>
  );
}

/* ── Badge ── */
function V2Badge({ kind = 'mute', dot = false, children }) {
  return (
    <span className={`v2-badge v2-badge-${kind}`}>
      {dot && <span className="v2-badge-dot" />}
      {children}
    </span>
  );
}

/* ── Avatar ── */
function V2Av({ color, text, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, minWidth: size,
      background: color, borderRadius: Math.round(size * 0.3),
      display: 'grid', placeItems: 'center',
      fontSize: Math.round(size * 0.36), fontWeight: 700, color: 'white', flexShrink: 0
    }}>{text}</div>
  );
}

/* ── Switch ── */
function V2Sw({ on, onToggle }) {
  return <button className={`v2-sw${on ? ' on' : ''}`} onClick={onToggle} type="button" aria-label="toggle" />;
}

/* ── Status dot ── */
function V2Dot({ status }) {
  return <span className={`v2-dot v2-dot-${status || 'off'}`} />;
}

/* ── KV ── */
function V2KV({ entries }) {
  return (
    <dl className="v2-kv">
      {entries.map(([k, v]) => (
        <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>
      ))}
    </dl>
  );
}

/* ── Uptime bar ── */
function V2UptimeBar({ pattern = 'gggggggggggg' }) {
  const cols = { g: 'var(--ok)', w: 'var(--warn)', e: 'var(--err)', o: 'var(--t4)' };
  return (
    <div className="v2-uptime-bar">
      {pattern.split('').map((c, i) => (
        <div key={i} className="v2-uptime-seg"
          style={{ background: cols[c] || cols.o, animationDelay: `${i * 12}ms` }} />
      ))}
    </div>
  );
}

/* ── NAV config ── */
const V2_NAV = [
  { id: 'overview',      label: 'Overview',      icon: 'home',     group: 0 },
  { id: 'conversations', label: 'Conversations', icon: 'chat',     group: 0 },
  { id: 'claude-code',   label: 'Claude Code',   icon: 'code',     group: 0 },
  { id: 'reviews',       label: 'Reviews',       icon: 'review',   group: 0 },
  { id: 'sessions',      label: 'Sessions',      icon: 'sessions', group: 1 },
  { id: 'agents',        label: 'Agents',        icon: 'agents',   group: 1 },
  { id: 'logs',          label: 'Logs',          icon: 'logs',     group: 2 },
  { id: 'settings',      label: 'Settings',      icon: 'settings', group: 2 },
];

const V2_CRUMBS = {
  overview:      ['Monitor', 'Overview'],
  conversations: ['Monitor', 'Conversations'],
  'claude-code': ['Monitor', 'Claude Code'],
  reviews:       ['Monitor', 'Reviews'],
  sessions:      ['Runtime', 'Sessions'],
  agents:        ['Runtime', 'Agents'],
  logs:          ['System',  'Logs'],
  settings:      ['System',  'Settings'],
};

/* ── Sidebar ── */
function V2Sidebar({ active, onNav }) {
  const [tip, setTip] = React.useState(null);
  const groups = [0, 1, 2];

  return (
    <aside className="v2-sb">
      <div className="v2-sb-mark">AM</div>
      <nav className="v2-sb-nav">
        {groups.map((g, gi) => (
          <React.Fragment key={g}>
            {gi > 0 && <div className="v2-sb-divider" />}
            {V2_NAV.filter(n => n.group === g).map(n => {
              const Icon = IC[n.icon] || IC.settings;
              return (
                <button key={n.id}
                  className={`v2-nav-item${active === n.id ? ' active' : ''}`}
                  onClick={() => onNav(n.id)}
                  onMouseEnter={() => setTip(n.id)}
                  onMouseLeave={() => setTip(null)}>
                  <Icon />
                  {tip === n.id && <div className="v2-tooltip">{n.label}</div>}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </nav>
      <div className="v2-sb-foot">
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--a)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, color: 'white', boxShadow: '0 0 10px var(--ag)' }}>K</div>
      </div>
    </aside>
  );
}

/* ── Header ── */
function V2Header({ screen }) {
  const crumbs = V2_CRUMBS[screen] || ['Overview'];
  const sys = window.AM_DATA.system;
  return (
    <header className="v2-hd">
      <div className="v2-hd-crumb">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="v2-hd-crumb-sep">/</span>}
            <span className={i === crumbs.length - 1 ? 'v2-hd-crumb-cur' : ''}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="v2-hd-spacer" />
      <div className="v2-health">
        {Object.values(sys).map(s => (
          <div key={s.label} className="v2-health-pill" title={s.detail}>
            <V2Dot status={s.status} />
            <span>{s.label}</span>
          </div>
        ))}
      </div>
      <button className="v2-hd-btn"><IC.sliders /><span>Settings</span></button>
    </header>
  );
}

Object.assign(window, {
  IC, useCount, V2Spark, V2Stat, V2Badge, V2Av, V2Sw, V2Dot, V2KV, V2UptimeBar,
  V2Sidebar, V2Header, V2_NAV, V2_CRUMBS,
});
