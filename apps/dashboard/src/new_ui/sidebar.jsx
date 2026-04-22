/* Sidebar — 17 items reorganized into 4 groups (was 6) */

const NAV = [
  { group: "Monitor", items: [
    { id: "overview",       label: "Overview",       icon: "home",     badge: null },
    { id: "conversations",  label: "Conversations",  icon: "chat",     badge: 3 },
    { id: "review_inbox",   label: "Review Inbox",   icon: "review",   badge: 4 },
  ]},
  { group: "Runtime", items: [
    { id: "agents",         label: "Agents",         icon: "agents" },
    { id: "sessions",       label: "Sessions",       icon: "sessions" },
    { id: "youtube",        label: "YouTube Relay",  icon: "yt" },
    { id: "cron",           label: "Cron",           icon: "cron" },
  ]},
  { group: "Configure", items: [
    { id: "channels",       label: "Channels",       icon: "channels" },
    { id: "tools",          label: "Tools",          icon: "tools" },
    { id: "routing",        label: "Routing Rules",  icon: "rules" },
    { id: "brain",          label: "Brain · People", icon: "brain" },
  ]},
  { group: "Advanced", items: [
    { id: "capabilities",   label: "Capabilities",   icon: "caps" },
    { id: "commands",       label: "Commands",       icon: "cmd" },
    { id: "config",         label: "Raw Config",     icon: "config" },
    { id: "settings",       label: "Settings",       icon: "settings" },
  ]},
];

const Sidebar = ({ active, onNav, iconsOnly }) => {
  return (
    <aside className="sb">
      <div className="sb-brand">
        <img src="/ManageClaw-TB-DarkMode.png" alt="ManageClaw" className="sb-logo-img" />
        <div className="sb-name">OpenClaw<em>v0.44</em></div>
      </div>
      <div className="sb-scroll">
        {NAV.map(sec => (
          <div className="sb-sec" key={sec.group}>
            <div className="sb-sec-h">{sec.group}</div>
            {sec.items.map(it => {
              const I_ = I[it.icon];
              return (
                <div key={it.id}
                     className={`sb-item ${active === it.id ? "active" : ""}`}
                     onClick={() => onNav && onNav(it.id)}
                     title={iconsOnly ? it.label : null}>
                  <I_/>
                  <span>{it.label}</span>
                  {it.badge ? <span className="sb-badge">{it.badge}</span> : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="sb-foot">
        <div className="sb-foot-avatar">KV</div>
        <div className="sb-foot-text">
          <div className="n">Karan V.</div>
          <div className="s mono">local · :7321</div>
        </div>
      </div>
    </aside>
  );
};
