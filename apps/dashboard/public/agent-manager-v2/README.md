# AgentManager v2 — "Obsidian Control Room"

Standalone HTML/JSX prototype handed off from Claude Design (claude.ai/design).
Deep-dark aesthetic, aurora ambient orbs, animated data, mission-control feel.

## Run

Dashboard dev server serves this dir statically.

```
pnpm dev:dashboard
# open http://localhost:3001/agent-manager-v2/
```

(Or whatever port the dashboard binds to.)

## Files

- `index.html` — entry (was `AgentManager v2.html` in handoff)
- `v2-styles.css` — full theme + animations
- `v2-ui.jsx` — Icons, hooks, primitives, Sidebar, Header
- `v2-screens-all.jsx` — Combined 6 screens + App shell (this is the file the HTML loads)
- `v2-overview.jsx` / `v2-convs.jsx` / `v2-cc.jsx` / `v2-reviews.jsx` / `v2-sessions.jsx` / `v2-agents.jsx` / `v2-app.jsx` — source-of-truth per-screen splits (not loaded; for editing)
- `am-data.js` / `am-data-extra.js` — mock data (window.AM_DATA)
- `screenshots/` — reference renders from design handoff

## Screens

Overview · Conversations · Claude Code · Reviews · Sessions · Agents

## Status

Prototype lives in `public/` so it ships as a static reference. Production integration into the Next.js dashboard (`apps/dashboard/src/app/**`) is a separate task — components must be rebuilt against real data/APIs, not the `window.AM_DATA` mocks.
