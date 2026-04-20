/* Shared primitive components */

const Sparkline = ({ data, color = "var(--accent)" }) => {
  const w = 100, h = 32;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - 4 - ((v - min) / range) * (h - 8)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const area = line + ` L ${w},${h} L 0,${h} Z`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${data.join("-")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.28"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area}  fill={`url(#sg-${data.join("-")})`} stroke="none"/>
      <path d={line} fill="none" stroke={color} strokeWidth="1.4"/>
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2" fill={color}/>
    </svg>
  );
};

const StatCard = ({ label, value, unit, sub, spark, accent }) => {
  const up = sub && sub.includes("+") && !sub.includes("-");
  const dn = sub && sub.includes("-");
  return (
    <div className="stat">
      <div className="stat-h">
        <span className="stat-l">{label}</span>
      </div>
      <div className="stat-v mono">
        {value}{unit && <em>{unit}</em>}
      </div>
      {spark && <Sparkline data={spark} color={accent || "var(--accent)"}/>}
      {sub && <div className="stat-sub"><span className={up ? "up" : dn ? "dn" : ""}>{sub}</span></div>}
    </div>
  );
};

const Badge = ({ kind = "mute", children, dot }) => (
  <span className={`badge ${kind}`}>
    {dot && <span className="dot" style={{background: "currentColor"}}/>}
    {children}
  </span>
);

const Switch = ({ on }) => <div className={`sw ${on ? "on" : ""}`}/>;

const UptimeBar = ({ pattern }) => (
  <span className="uptime-bar" title="last 24h">
    {pattern.split("").map((c, i) => (
      <span key={i} className={c === "w" ? "w" : c === "e" ? "e" : c === "o" ? "o" : ""}/>
    ))}
  </span>
);

const Avatar = ({ color, text, size = 32, radius = "50%" }) => (
  <div style={{
    width: size, height: size, borderRadius: radius,
    background: color, color: "white",
    display: "grid", placeItems: "center",
    fontSize: size * 0.38, fontWeight: 600,
    flexShrink: 0, letterSpacing: "-0.02em"
  }}>{text}</div>
);

const KV = ({ entries }) => (
  <dl className="kv">
    {entries.map(([k, v]) => (
      <React.Fragment key={k}>
        <dt>{k}</dt><dd>{v}</dd>
      </React.Fragment>
    ))}
  </dl>
);
