/* App shell */

const SCREENS = [
  { id: "overview",      label: "Overview",      crumbs: ["Monitor", "Overview"] },
  { id: "conversations", label: "Conversations", crumbs: ["Monitor", "Conversations"] },
  { id: "sessions",      label: "Sessions",      crumbs: ["Runtime", "Sessions"] },
  { id: "agents",        label: "Agents",        crumbs: ["Runtime", "Agents"] },
];

const App = () => {
  const [tweaks, setTweaks] = React.useState(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  const [editAvailable, setEditAvailable] = React.useState(false);

  const [screen, setScreen] = React.useState(() => {
    try { return localStorage.getItem("ocm-screen") || "overview"; } catch { return "overview"; }
  });

  React.useEffect(() => {
    try { localStorage.setItem("ocm-screen", screen); } catch {}
  }, [screen]);

  // Apply tweaks to root element
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", tweaks.theme === "light");
    root.classList.toggle("compact", tweaks.density === "compact");
  }, [tweaks.theme, tweaks.density]);

  // Edit-mode protocol
  React.useEffect(() => {
    const handler = (e) => {
      if (!e.data) return;
      if (e.data.type === "__activate_edit_mode")   setTweaksOpen(true);
      if (e.data.type === "__deactivate_edit_mode") setTweaksOpen(false);
    };
    window.addEventListener("message", handler);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    setEditAvailable(true);
    return () => window.removeEventListener("message", handler);
  }, []);

  const onNav = (id) => {
    if (SCREENS.find(s => s.id === id)) setScreen(id);
    else {
      // Stub: stay on current and flash
      // No-op; screens not implemented show nothing extra
      setScreen(id);
    }
  };

  const current = SCREENS.find(s => s.id === screen);
  const iconsOnly = tweaks.sidebar === "icons";

  return (
    <>
      <div className="switcher">
        {SCREENS.map(s => (
          <button key={s.id} className={screen === s.id ? "on" : ""} onClick={() => setScreen(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      <div className={`app ${iconsOnly ? "icons" : ""}`} data-screen-label={current ? current.label : "Unknown"}>
        <Sidebar active={screen} onNav={onNav} iconsOnly={iconsOnly}/>
        <main>
          <Header
            title={current ? current.label : ""}
            crumbs={current ? current.crumbs : ["Not yet designed"]}
          />
          <div className="content">
            {screen === "overview"      && <OverviewScreen layoutVariant={tweaks.overviewLayout}/>}
            {screen === "conversations" && <ConversationsScreen/>}
            {screen === "sessions"      && <SessionsScreen/>}
            {screen === "agents"        && <AgentsScreen/>}
            {!SCREENS.find(s => s.id === screen) && (
              <div style={{padding: "60px 0", textAlign: "center", color: "var(--text-muted)"}}>
                <div style={{fontSize: 15, marginBottom: 6, color: "var(--text)"}}>This screen is not part of the priority set.</div>
                <div style={{fontSize: 13}}>The 4 hero screens (Overview, Conversations, Sessions, Agents) are fully designed.</div>
                <div style={{marginTop: 20}}>
                  <button className="btn" onClick={() => setScreen("overview")}>← Back to Overview</button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <TweakPanel open={tweaksOpen} setOpen={setTweaksOpen} tweaks={tweaks} setTweaks={setTweaks}/>
    </>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
