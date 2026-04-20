/* Tweaks panel — sidebar style, density, overview layout, theme */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "sidebar": "labeled",
  "density": "comfortable",
  "overviewLayout": "attention"
}/*EDITMODE-END*/;

const TweakPanel = ({ open, setOpen, tweaks, setTweaks }) => {
  const set = (k, v) => {
    setTweaks(prev => {
      const next = { ...prev, [k]: v };
      window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { [k]: v } }, "*");
      return next;
    });
  };

  return (
    <>
      <button className="tw-fab" onClick={() => setOpen(!open)}>
        <I.sliders/>Tweaks
      </button>
      {open && (
        <div className="tw-panel">
          <div className="tw-group">
            <div className="tw-h">Theme</div>
            <div className="tw-row">
              <span>Mode</span>
              <div className="seg">
                <button className={tweaks.theme === "dark" ? "on" : ""} onClick={() => set("theme", "dark")}>Dark</button>
                <button className={tweaks.theme === "light" ? "on" : ""} onClick={() => set("theme", "light")}>Light</button>
              </div>
            </div>
          </div>

          <div className="tw-group">
            <div className="tw-h">Sidebar</div>
            <div className="tw-row">
              <span>Style</span>
              <div className="seg">
                <button className={tweaks.sidebar === "labeled" ? "on" : ""} onClick={() => set("sidebar", "labeled")}>Labels</button>
                <button className={tweaks.sidebar === "icons"   ? "on" : ""} onClick={() => set("sidebar", "icons")}>Icons</button>
              </div>
            </div>
          </div>

          <div className="tw-group">
            <div className="tw-h">Density</div>
            <div className="tw-row">
              <span>Rows</span>
              <div className="seg">
                <button className={tweaks.density === "comfortable" ? "on" : ""} onClick={() => set("density", "comfortable")}>Comfy</button>
                <button className={tweaks.density === "compact"     ? "on" : ""} onClick={() => set("density", "compact")}>Compact</button>
              </div>
            </div>
          </div>

          <div className="tw-group">
            <div className="tw-h">Overview layout</div>
            <div className="tw-row" style={{flexDirection: "column", alignItems: "stretch", gap: 4}}>
              <div className="seg" style={{width: "100%"}}>
                <button style={{flex: 1}} className={tweaks.overviewLayout === "attention" ? "on" : ""} onClick={() => set("overviewLayout", "attention")}>Attention-first</button>
                <button style={{flex: 1}} className={tweaks.overviewLayout === "cards" ? "on" : ""} onClick={() => set("overviewLayout", "cards")}>Cards-first</button>
              </div>
              <div className="seg" style={{width: "100%", marginTop: 4}}>
                <button style={{flex: 1}} className={tweaks.overviewLayout === "split" ? "on" : ""} onClick={() => set("overviewLayout", "split")}>Split</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
