# OpenClaw-Manager Global Distribution — Design

**Date:** 2026-05-10
**Authors:** Claude Code, Hermes (consulted via mcp-hermes)
**Status:** Draft for review

## Problem

OpenClaw-Manager today is hardwired to Gal's homelab: hardcoded LAN IPs (`192.168.0.148/.240/.10`), absolute Windows paths under `C:\Users\GalLe\...`, a hash-versioned global OpenClaw SDK file, NSSM service names like `OpenClaw-Bridge`, a CentOS systemd + nginx + bare-git deploy pipeline, and committed admin password literals (`openclaw2026`). There is no top-level README. A developer cloning the repo today cannot run it without manually rewriting two `.env` files and reading scattered notes.

## Goal

Any developer can clone the repo and reach a working dashboard in three commands:

```
pnpm install
pnpm setup
pnpm dev
```

The setup wizard handles path discovery, port selection, secret generation, and Hermes opt-in. Bridge runs on the same host as OpenClaw (filesystem + loopback gateway require it). Dashboard can run on the same host or any host that can reach the bridge. PM2 is the documented production process manager; native systemd / NSSM / launchd are advanced docs only.

## Non-goals

- No Docker for v1. The bridge is filesystem- and loopback-coupled to OpenClaw; containerizing it adds onboarding friction without payoff. (Optional dashboard-only Docker may come later.)
- No first-run web wizard. Env-file-based config remains the source of truth; the wizard is a CLI script that writes `.env` files.
- No backwards-compatibility for Gal's homelab paths. The setup wizard rewrites them; existing `.env` files are gitignored anyway.
- No upstream changes to the OpenClaw SDK package. We document the resolver as transitional tech debt and propose a stable entrypoint upstream as a separate effort.

## Architecture

### Topology (default, single-host)

```
[Browser]
   |
   v  http://localhost:3000
[Dashboard (Next.js)]  --server-side fetch-->  [Bridge (Express)]  --SDK ws-->  [OpenClaw Gateway]
                       BRIDGE_TOKEN                127.0.0.1:3100              127.0.0.1:18789
```

Bridge binds `127.0.0.1` by default. Dashboard talks to bridge from server code only — browser never sees the bridge URL or token. Optional Hermes is reached over LAN HTTP if `HERMES_BASE_URL` is set; absent = disabled.

### Topology (advanced, split host)

```
[Browser] -> [Dashboard host] --LAN HTTP+token--> [Bridge host = OpenClaw host]
```

User opts into LAN exposure by setting `BRIDGE_HOST=0.0.0.0` and providing the bridge URL to the dashboard. Setup wizard warns about the security implications. Documented in `docs/deploy/advanced.md`, not the README happy path.

### Browser-vs-server invariant

Dashboard must access bridge **only from server-side code** (Next.js route handlers, server actions, server components). No browser bundle may contain `BRIDGE_TOKEN` or call the bridge directly. Single-host default: `BRIDGE_HOST=127.0.0.1`. Remote-dashboard deployments require the bridge host to be reachable from the dashboard host on a private interface or VPN; binding the bridge to public internet is not supported without TLS + reverse proxy + tightened auth (out of scope for v1).

## Components

### 1. Setup wizard — `scripts/setup.ts`

Cross-platform Node script. Runs explicitly via `pnpm setup`. Never runs in `postinstall`.

Responsibilities:
- Detect Node ≥ 20.11 and pnpm ≥ 9; abort with clear message otherwise.
- Detect free ports for bridge (default 3100) and dashboard (default 3000); offer alternatives if occupied.
- Detect OpenClaw home: try `$OPENCLAW_HOME`, then `~/.openclaw`, then prompt.
- Resolve OpenClaw SDK via `apps/bridge/src/openclaw/resolve-sdk.ts` (see §3); warn if falling back to global hash file.
- Ask: "Use a remote Hermes runtime? (y/N)". If yes, prompt for `HERMES_BASE_URL` + `HERMES_TOKEN`.
- Generate `BRIDGE_TOKEN`, `SESSION_SECRET`, `ADMIN_PASSWORD` via `crypto.randomBytes(32).toString('hex')` (admin password = readable wordlist phrase like `pomegranate-tunnel-82`). Print admin password once to stdout.
- Write:
  - `apps/bridge/.env`
  - `apps/dashboard/.env.local` (Next.js convention; current dashboard reads from `.env` — setup wizard writes `.env.local` and migration is part of subagent #4: switch dashboard to load `.env.local` first, fall back to `.env` for the upgrade window)
- Idempotent: re-running detects existing files and asks before overwrite. Supports `--yes`, `--non-interactive`, `--reset-admin-password`, `--bridge-port`, `--dashboard-port`, `--openclaw-home` flags.

Path serialization on Windows uses forward slashes (`C:/Users/...`) — Node accepts them and dotenv parsers don't choke.

### 2. Doctor — `scripts/doctor.ts`

`pnpm doctor` runs read-only health checks:
- Node + pnpm versions
- Env files exist + parse
- Bridge port reachable on `localhost:$BRIDGE_PORT/healthz`
- OpenClaw gateway reachable at `127.0.0.1:18789` (warning, not error, if down)
- Hermes shim reachable at `$HERMES_BASE_URL/v1/health` (skipped if not configured)

Exits 0 if all required checks pass, non-zero with actionable hints otherwise.

### 3. SDK resolver — `apps/bridge/src/openclaw/resolve-sdk.ts`

Single module. All other code stays oblivious to discovery logic.

Resolution order:
1. `OPENCLAW_SDK_PATH` env override (escape hatch).
2. `require.resolve('openclaw/package.json')` — if OpenClaw is a normal workspace dep.
3. Local workspace `node_modules/openclaw/dist/call-*.js` glob.
4. Global npm root fallback (`npm root -g`) glob — emits a warning to stderr that this is unsupported.
5. Throws with a setup hint:
   ```
   Could not resolve OpenClaw SDK.
     pnpm --filter bridge add openclaw
   or set OPENCLAW_SDK_PATH=/abs/path/to/dist/call-*.js
   ```

Resolver is unit-tested with synthetic node_modules layouts. Code comment marks the glob fallback as transitional tech debt; tracked separately as "OpenClaw SDK stable entrypoint" upstream task.

### 4. Config module — `apps/bridge/src/config.ts`

Today the bridge reads env vars ad-hoc. Centralize:
- `loadConfig()` returns a typed `BridgeConfig`.
- Defaults derive from `os.homedir()`:
  - `OPENCLAW_HOME` → `~/.openclaw`
  - `OPENCLAW_STATE_PATH` → `$OPENCLAW_HOME/workspace/.openclaw/extensions/whatsapp-auto-reply/whatsapp-auto-reply-state.json`
  - `MANAGEMENT_DIR` → `$OPENCLAW_HOME/workspace/.openclaw/extensions/whatsapp-auto-reply/management`
  - `OPENCLAW_SESSIONS_DIR` → `$OPENCLAW_HOME/agents/main/sessions`
  - `BRAIN_VAULT_PATH` → `~/Documents/Brainclaw/OpenClaw Brain` (overridable)
- `BRIDGE_HOST` defaults to `127.0.0.1`.
- Hermes config is optional; absent `HERMES_BASE_URL` means Hermes is disabled.
- Validation runs on boot. Missing required values produce one error block listing all missing keys with hints, not a single cryptic crash.

### 5. Hermes optionality

Today `apps/bridge/src/server.ts` calls `createHermesChatBackend` and the runtime registry references `runtimes.json` entries. Changes:
- Hermes adapter constructor takes `config | null`. Null = disabled, no network calls.
- Runtime registry exposes status objects regardless of config:
  ```ts
  { id: "hermes", label: "Hermes", enabled: false, status: "not_configured", reason: "HERMES_BASE_URL not set" }
  ```
- Copilot chat backend selection: if Hermes disabled, fall back to OpenClaw-only.
- Bridge boots cleanly with no Hermes env vars set; `pnpm doctor` reports Hermes as "not configured" (informational), not "down" (error).

#### `runtimes.json` ownership

Canonical runtime config moves to **manager-owned** `apps/bridge/config/runtimes.json` (read on bridge boot). Plugin-managed `openclaw-plugin/management/runtimes.json` is treated as plugin state, not manager config.

Setup wizard:
- Always writes/regenerates `apps/bridge/config/runtimes.json` from wizard answers (OpenClaw entry always present, Hermes only if user opted in).
- Seeds `openclaw-plugin/management/runtimes.json` **only if absent**. Never overwrites without `--reset-runtimes`.
- Bridge runtime registry resolves from manager-owned config first; plugin file read only as fallback for legacy installs.

Wizard prints a one-line note if it skipped seeding because the plugin file already existed, so users aren't confused about which file is authoritative.

### 6. Process management — PM2

Add `ecosystem.config.cjs` at repo root with two apps:

```js
module.exports = {
  apps: [
    {
      name: "openclaw-manager-bridge",
      cwd: "apps/bridge",
      script: "dist/server.js",
      env: { NODE_ENV: "production" }
    },
    {
      name: "openclaw-manager-dashboard",
      script: "pnpm",
      args: "--filter dashboard start",
      env: { NODE_ENV: "production" }
    }
  ]
}
```

Root scripts:
- `pnpm pm2:start` → `pm2 start ecosystem.config.cjs`
- `pnpm pm2:restart`, `pnpm pm2:stop`, `pnpm pm2:logs`
- `concurrently`-based `pnpm dev` for parallel dev.

PM2 is global tooling, not a workspace dep. README links to PM2 install instructions; doesn't make it a hard requirement.

### 7. Documentation reorganization

Top-level files (new):
- `README.md` — what it is, architecture diagram, quick-start (3 commands), connect-to-OpenClaw, optional Hermes, production with PM2, troubleshooting pointer.
- `INSTALL_README.md` — long-form installation walkthrough (the deliverable Gal asked for; this is the user-facing install guide).
- `SECURITY.md` — bridge token, session secret, default localhost binding, LAN/internet exposure caveats.
- `CONTRIBUTING.md` — dev loop, tests, project layout.
- `LICENSE` — MIT.
- `.env.example` files at `apps/bridge/.env.example` and `apps/dashboard/.env.example` with empty placeholder values, no real-looking tokens.

Move to `docs/deploy/`:
- `docs/deploy/systemd.md` — CentOS systemd unit template
- `docs/deploy/windows-service.md` — NSSM template
- `docs/deploy/nginx.md` — reverse proxy
- `docs/deploy/advanced.md` — split-host topology, LAN exposure
- `docs/deploy/docker-dashboard.md` — optional dashboard container

Move from `PLAN.md` to `docs/`:
- Existing `PLAN.md` is stale (refers to the v1 WhatsApp manager scope). Move to `docs/history/2026-04-06-initial-plan.md` for archive.

### 8. Engines + package metadata

Root `package.json`:
- `"name": "openclaw-manager"` (rename from `openclaw-whatsapp-manager` — already drifted from current scope).
- `"engines": { "node": ">=20.11.0", "pnpm": ">=9" }`
- `"packageManager": "pnpm@9.x.x"` (pin to current).
- `"description"`, `"repository"`, `"license": "MIT"`, `"keywords"`.

## Data flow changes

No runtime data-flow changes. This is config + distribution; the bridge ↔ dashboard ↔ OpenClaw protocols stay intact.

## Tests

New unit tests:
- `apps/bridge/test/resolve-sdk.test.ts` — five resolution paths, including warning on global fallback.
- `apps/bridge/test/config.test.ts` — defaults from `os.homedir()`, Hermes disabled when env absent, validation errors aggregate.
- `scripts/test/setup.test.ts` — env file generation, secret randomness, Windows path serialization, idempotency check.
- `apps/bridge/test/runtime-registry-no-hermes.test.ts` — registry returns Hermes-disabled status without errors.

Manual end-to-end (subagent 7):
- Fresh clone in a worktree, simulate empty `~/.openclaw`, run `pnpm install && pnpm setup --yes && pnpm dev`. Verify dashboard at `localhost:3000`, bridge `/healthz` reports OpenClaw disconnected (gateway not running) without crashing.

## Hardcoded references to purge

Search-and-purge list (Hermes-suggested):
- `GalLe`, `gal` (lowercase username)
- `192.168.0.148`, `192.168.0.240`, `192.168.0.10`
- `openclaw2026` (admin password literal)
- `OpenClaw-Bridge` (NSSM service name)
- `C:\Users\GalLe\` absolute paths
- `/opt/openclaw-manager` deploy path
- `C:\ProgramData\OpenClaw-Bridge\logs\`
- Hardcoded Hermes / Bridge tokens in any committed file

Each hit is either deleted, parameterized via env, or moved to `docs/deploy/advanced.md` as a worked example.

## Subagent workstreams

Independent, parallelizable except where noted:

1. **Audit + purge** — grep all Gal-specific strings, produce removal/parameterization patch. Inventories what each subagent must touch.
2. **Config module + SDK resolver** — `apps/bridge/src/config.ts` + `apps/bridge/src/openclaw/resolve-sdk.ts` + tests.
3. **Hermes optionality** — adapter accepts null config, runtime registry exposes status, copilot chat falls back. Tests for no-Hermes boot.
4. **Setup wizard + doctor + generated-env consumption** — `scripts/setup.ts`, `scripts/doctor.ts`, `.env.example` files, root scripts, **dashboard env-loading precedence (`.env.local` → `.env` → process env) + tests**. Owner of "wizard output is actually consumed by both apps." Depends on #2 for config defaults. Bounded scope: do not drift into general dashboard config refactor.
5. **PM2 + deploy doc reorg** — `ecosystem.config.cjs`, root scripts, move systemd/NSSM/nginx into `docs/deploy/`.
6. **README + INSTALL_README + SECURITY + LICENSE + engines** — top-level docs and `package.json` metadata.
7. **End-to-end smoke** — fresh-clone simulation in a temp dir, runs after #1–#6 merge. Reports any rough edges.

Subagents 1, 2, 3 run in parallel first. 4 depends on 2. 5 + 6 run in parallel with 4. 7 runs last.

## Risks

- **OpenClaw SDK upstream drift.** Hash-file glob may break on a future SDK that ships ESM-only or moves the entrypoint. Mitigation: resolver throws with setup hint; bridge documents `OPENCLAW_SDK_PATH` escape hatch; we file an upstream issue for stable entrypoint as a separate effort.
- **Windows path edge cases in dotenv parsers.** Backslashes can be misread as escape sequences. Mitigation: setup wizard writes forward-slash paths.
- **OpenClaw gateway lifecycle confusion.** Gateway only exists while user logged in; new users will see "OpenClaw disconnected" and assume the manager is broken. Mitigation: bridge exposes `/healthz` with `openclaw: disconnected, reason: ECONNREFUSED, hint: start OpenClaw`. Dashboard renders this state distinctly. Doctor command surfaces it.
- **PM2 not installed.** Users hitting `pnpm pm2:start` without PM2 get a confusing error. Mitigation: scripts run `pm2 --version` first and print install hint on ENOENT.
- **Stale `PLAN.md` confusing readers.** Already drifted from current scope. Mitigation: move to `docs/history/`, replace with new top-level README.

## Out of scope (explicit deferrals)

- Docker images (dashboard-only or full).
- Web-based first-run wizard.
- Multi-tenant deployment.
- TLS termination automation (cert-manager / Let's Encrypt). User wires their own reverse proxy.
- Telemetry / phone-home.
- Auto-update mechanism.
- Upstream OpenClaw SDK stable-entrypoint contribution (separate effort).
