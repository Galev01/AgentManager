/* Header with always-visible Gateway/Bridge/Relay/LLM health strip */

const HealthStrip = () => {
  const items = [window.DATA.gateway, window.DATA.bridge, window.DATA.relay, window.DATA.llm];
  return (
    <div className="health">
      {items.map((it, i) => (
        <div key={i} className={`health-pill ${it.status}`} title={it.detail}>
          <span className="dot"/>
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
};

const Header = ({ title, crumbs }) => (
  <header className="hd">
    <div className="hd-crumb">
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="sep">/</span>}
          <span style={{ color: i === crumbs.length - 1 ? "var(--text)" : undefined, fontWeight: i === crumbs.length - 1 ? 500 : 400 }}>{c}</span>
        </React.Fragment>
      ))}
    </div>
    <div className="hd-spacer"/>
    <div className="hd-search">
      <I.search/>
      <span>Jump to conversation, agent, session…</span>
      <span className="kbd">⌘K</span>
    </div>
    <HealthStrip/>
    <button className="hd-btn" title="Notifications"><I.bell/></button>
  </header>
);
