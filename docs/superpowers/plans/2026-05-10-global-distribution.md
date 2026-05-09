# OpenClaw-Manager Global Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenClaw-Manager installable by any developer in three commands (`pnpm install && pnpm setup && pnpm dev`) on Win/Mac/Linux, with no Gal-specific paths, IPs, tokens, or service names baked in.

**Architecture:** Pure pnpm (no Docker for v1). Cross-platform Node setup wizard generates `.env` files with random secrets, auto-discovers OpenClaw home + SDK path, optionally enables Hermes. Bridge defaults to `127.0.0.1`. PM2 is the documented production process manager. Dashboard always talks to bridge server-side; browser never sees `BRIDGE_TOKEN`. Manager-owned `apps/bridge/config/runtimes.json` becomes the canonical runtime registry; legacy plugin file is fallback only. Existing CentOS/systemd/NSSM/nginx artifacts move to `docs/deploy/`.

**Tech Stack:** Node ≥ 20.11, pnpm ≥ 9, TypeScript, Express (bridge), Next.js 15 + React 19 (dashboard), `node:test` for bridge tests, Vitest for dashboard tests, PM2 for prod process management.

**Spec:** `docs/superpowers/specs/2026-05-10-global-distribution-design.md`

---

## Task ordering and parallelization

Subagent workstreams. Indented bullets = strict sequential dependency.

```
Wave 1 (parallel):
  Task 1 — Audit + purge Gal-specific strings
  Task 2 — Config module + SDK resolver + tests
  Task 3 — Hermes optionality + tests + manager-owned runtimes.json read path

Wave 2:
  Task 4 — Setup wizard + doctor + dashboard env precedence  (depends on Task 2)

Wave 3 (parallel with each other, run after Task 4):
  Task 5 — PM2 + deploy doc reorg
  Task 6 — README + INSTALL_README + SECURITY + LICENSE + engines

Wave 4:
  Task 7 — End-to-end fresh-clone smoke (runs after all merges)
```

Each task ends with a commit. Each commit on a topic branch named `Gal/global-task-N-<slug>`. Squash-merge to `main` after Hermes review.

---

## Task 1: Audit + purge Gal-specific strings

**Branch:** `Gal/global-task-1-audit-purge`
**Owner subagent:** general-purpose
**Files:**
- Modify (parameterize): `apps/bridge/src/config.ts:28-38` — replace hardcoded `C:\\Users\\GalLe\\Cursor projects` reviewer scan default with `os.homedir()`-based default
- Modify: `.env.example` (root) — replace `BRIDGE_HOST=192.168.0.50` with `127.0.0.1`, replace `OPENCLAW_BRIDGE_URL=http://192.168.0.50:3100` with `http://127.0.0.1:3100`, replace all `changeme` literals with empty (wizard fills them)
- Modify: `apps/bridge/.env.example` (create if missing, delete `apps/bridge/.env`-committed-leak if present)
- Modify: `apps/dashboard/.env.example` (create)
- Modify (move/delete): `scripts/install-bridge-service.ps1`, `scripts/restart-bridge-service.ps1`, `scripts/run-elevated.ps1`, `scripts/run-elevated-restart.ps1`, `scripts/restart-openclaw-stack.ps1` — move to `docs/deploy/windows-service/scripts/` (preserved as advanced docs, not deleted)
- Modify: any source files containing `192.168.0.{10,148,240}`, `OpenClaw-Bridge`, `openclaw2026`, `/opt/openclaw-manager`, `C:\\ProgramData\\OpenClaw-Bridge`, `GalLe`, hardcoded HERMES_TOKEN/BRIDGE_TOKEN/SESSION_SECRET hex literals
- Move: `PLAN.md` → `docs/history/2026-04-06-initial-plan.md`

- [ ] **Step 1.1: Inventory Gal-specific strings**

Run from repo root:

```powershell
# PowerShell
$patterns = "GalLe","gal,",`
            "192\.168\.0\.(?:10|148|240|50)`",`
            "OpenClaw-Bridge","openclaw2026","/opt/openclaw-manager",`
            "C:\\\\Users\\\\GalLe","C:\\\\ProgramData\\\\OpenClaw-Bridge"
```

But the canonical search uses Grep tool. Run for each pattern separately and save the file/line list to `audit-report.txt` (gitignored, scratch). Patterns to grep:

- `GalLe`
- `192\.168\.0\.(10|148|240|50)`
- `OpenClaw-Bridge`
- `openclaw2026`
- `/opt/openclaw-manager`
- `C:\\\\Users\\\\GalLe` (escaped backslashes)
- `C:\\\\ProgramData\\\\OpenClaw-Bridge`
- `Cursor projects` (Gal's path segment)

Exclude: `node_modules`, `.worktrees`, `dist`, `.next`, `Fillow-v2.0-24-November-2023` (vendored asset), `pnpm-lock.yaml`, `*.lock`, `docs/superpowers/specs/2026-05-10-global-distribution-design.md` (spec quotes them on purpose), `docs/superpowers/plans/2026-05-10-global-distribution.md` (this plan).

Memory files under `C:\Users\GalLe\.claude\projects\...` are local agent memory — not in repo, do not touch.

- [ ] **Step 1.2: Categorize each hit**

For each match, decide one of:
- **Delete** (obsolete reference)
- **Parameterize** (replace literal with env var or `os.homedir()` derivation)
- **Move to docs/deploy/** (legitimate advanced-deployment example)
- **Keep** (legitimate, e.g., loopback `127.0.0.1` defaults)

Write the decision next to each hit in `audit-report.txt`. Commit nothing yet.

- [ ] **Step 1.3: Fix `apps/bridge/src/config.ts` reviewer scan default**

```ts
import os from "node:os";

reviewerScanRoots: (
  process.env.REVIEWER_SCAN_ROOTS ||
  process.env.REVIEWER_SCAN_ROOT ||
  path.join(os.homedir(), "Documents")
)
  .split(/[;]/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0),
```

(Uses `~/Documents` as a sane default; users override via env. Removes `C:\Users\GalLe\Cursor projects` literal.)

- [ ] **Step 1.4: Rewrite root `.env.example`**

Replace contents wholesale:

```
# OpenClaw-Manager environment.
# This file is committed and contains placeholders only.
# Real values live in apps/bridge/.env and apps/dashboard/.env.local
# (both gitignored). Run `pnpm setup` to generate them.
#
# Variables here are kept for documentation reference. Apps load from
# their per-app env files, not from this root file.

# See apps/bridge/.env.example and apps/dashboard/.env.example.
```

- [ ] **Step 1.5: Create `apps/bridge/.env.example`**

```
# Bridge — copy to apps/bridge/.env and fill in, or run `pnpm setup`.

# Where the bridge binds. 127.0.0.1 is correct for single-host installs.
# Set to 0.0.0.0 only if a remote dashboard host needs to reach this bridge
# over a private LAN/VPN; pair with a reverse proxy and TLS for anything else.
BRIDGE_HOST=127.0.0.1
BRIDGE_PORT=3100

# Shared bearer secret between bridge and dashboard. Generate 32+ random bytes.
BRIDGE_TOKEN=

# Stable identity stamped on runtime-dispatched actions for audit coherence.
BRIDGE_SERVICE_ID=bridge-primary

# OpenClaw — required.
# OPENCLAW_HOME defaults to ~/.openclaw. Override only if your install lives
# elsewhere.
OPENCLAW_HOME=
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=

# Path overrides — leave blank to derive from OPENCLAW_HOME.
OPENCLAW_STATE_PATH=
MANAGEMENT_DIR=
OPENCLAW_SESSIONS_DIR=
OPENCLAW_SDK_PATH=

# Brain vault — defaults to ~/Documents/Brainclaw/OpenClaw\ Brain.
BRAIN_VAULT_PATH=

# Codebase reviewer scan roots (semicolon-separated). Defaults to ~/Documents.
REVIEWER_SCAN_ROOTS=

# --- Auth ---
# Shared HMAC secret used by the dashboard to sign actor assertions and the
# bridge to verify them. MUST be ≥ 32 random characters. Mirror the same value
# into apps/dashboard/.env.local.
AUTH_ASSERTION_SECRET=

# First-run bootstrap token. POST {token, username, password} to /auth/bootstrap
# (dashboard form: /bootstrap) to create the initial admin. After the first user
# exists, this endpoint returns 403 forever.
AUTH_BOOTSTRAP_TOKEN=

# Optional session tuning.
AUTH_SESSION_TTL_MS=604800000
AUTH_SESSION_LASTSEEN_THROTTLE_MS=60000
AUTH_WS_TICKET_TTL_MS=60000

# --- OIDC (optional; leave blank to disable) ---
AUTH_OIDC_ISSUER_URL=
AUTH_OIDC_CLIENT_ID=
AUTH_OIDC_CLIENT_SECRET=
AUTH_OIDC_REDIRECT_URI=
AUTH_OIDC_SCOPES=openid email profile
AUTH_OIDC_PROVIDER_NAME=Single Sign-On
AUTH_OIDC_PROVIDER_KEY=default
AUTH_OIDC_AUTO_PROVISION=false

# --- Hermes (optional; leave blank to disable) ---
HERMES_BASE_URL=
HERMES_TOKEN=
```

- [ ] **Step 1.6: Create `apps/dashboard/.env.example`**

```
# Dashboard — copy to apps/dashboard/.env.local and fill in, or run `pnpm setup`.

# Where the dashboard reaches the bridge. Single-host: http://127.0.0.1:3100.
# Split-host: the bridge's private LAN/VPN URL.
OPENCLAW_BRIDGE_URL=http://127.0.0.1:3100

# Mirrors BRIDGE_TOKEN in apps/bridge/.env. Generated by `pnpm setup`.
OPENCLAW_BRIDGE_TOKEN=

# Mirrors AUTH_ASSERTION_SECRET in apps/bridge/.env. Generated by `pnpm setup`.
AUTH_ASSERTION_SECRET=

# HMAC key for the dashboard's session cookie (`ocm_session`). Generate 32+ bytes.
SESSION_SECRET=

# Cookie security. False on plain HTTP LAN; true behind TLS.
COOKIE_SECURE=false
```

- [ ] **Step 1.7: Move PowerShell deploy scripts to docs**

```bash
mkdir -p docs/deploy/windows-service/scripts
git mv scripts/install-bridge-service.ps1 docs/deploy/windows-service/scripts/
git mv scripts/restart-bridge-service.ps1 docs/deploy/windows-service/scripts/
git mv scripts/run-elevated.ps1 docs/deploy/windows-service/scripts/
git mv scripts/run-elevated-restart.ps1 docs/deploy/windows-service/scripts/
git mv scripts/restart-openclaw-stack.ps1 docs/deploy/windows-service/scripts/
```

- [ ] **Step 1.8: Move stale PLAN.md to history**

```bash
mkdir -p docs/history
git mv PLAN.md docs/history/2026-04-06-initial-plan.md
```

- [ ] **Step 1.9: Address remaining audit hits one by one**

For every entry in `audit-report.txt` not yet handled by 1.3-1.8:
- If it's in source code → parameterize with env var (add to `.env.example` if needed).
- If it's in a doc/script under `docs/deploy/` → leave but generalize (replace `192.168.0.148` with `<bridge-host>`).
- If it's a test fixture / smoke script → either delete or replace literal with env-driven value.
- If it's a comment that references Gal's homelab → rewrite to be host-agnostic.

Track each fix in `audit-report.txt` (delete the entry once handled).

- [ ] **Step 1.10: Verify nothing remains**

Re-run grep for each pattern from Step 1.1. Expected: only matches are in:
- `docs/deploy/advanced.md` (worked example with `<placeholder>` syntax, no real IPs)
- `docs/superpowers/specs/2026-05-10-global-distribution-design.md` (legitimate spec quotes)
- `docs/superpowers/plans/2026-05-10-global-distribution.md` (this plan)
- `docs/history/2026-04-06-initial-plan.md` (archived)

If anything else surfaces, fix it.

- [ ] **Step 1.11: Build + test**

```bash
pnpm install
pnpm --filter bridge build
pnpm --filter dashboard build
pnpm --filter bridge test
```

Expected: all pass. Reviewer-scan default change must not break any existing test (it's a default-only change; tests should set `REVIEWER_SCAN_ROOTS` explicitly).

- [ ] **Step 1.12: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: purge Gal-specific paths, IPs, service names

Replace homelab literals with env-driven defaults. Move Windows-service
deploy scripts into docs/deploy/windows-service/. Archive stale PLAN.md
to docs/history/. Refresh .env.example files with empty placeholders.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Config module + SDK resolver + tests

**Branch:** `Gal/global-task-2-config-resolver`
**Owner subagent:** general-purpose
**Files:**
- Create: `apps/bridge/src/openclaw/resolve-sdk.ts`
- Create: `apps/bridge/test/resolve-sdk.test.ts`
- Modify: `apps/bridge/src/config.ts` — add `os.homedir()`-derived defaults; add `resolveSdkPath()` call; centralize Hermes config; aggregate validation errors
- Create: `apps/bridge/test/config-defaults.test.ts`
- Modify: places that read `OPENCLAW_SDK_PATH` directly — switch to `config.openclawSdkPath`. Inventory:
  - Search for `process.env.OPENCLAW_SDK_PATH` and `OPENCLAW_SDK_PATH` literal across `apps/bridge/src/**`. Replace each with `config.openclawSdkPath`.

- [ ] **Step 2.1: Write failing test for SDK resolver**

Create `apps/bridge/test/resolve-sdk.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { resolveSdkPath } from "../src/openclaw/resolve-sdk.js";

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ocm-sdk-test-"));
}

test("env override wins", () => {
  const dir = tmp();
  const file = path.join(dir, "call-OVERRIDE.js");
  fs.writeFileSync(file, "");
  const result = resolveSdkPath({ env: { OPENCLAW_SDK_PATH: file }, cwd: dir });
  assert.equal(result.path, file);
  assert.equal(result.source, "env-override");
});

test("local workspace node_modules glob picks newest call-*.js", () => {
  const dir = tmp();
  const sdkDir = path.join(dir, "node_modules", "openclaw", "dist");
  fs.mkdirSync(sdkDir, { recursive: true });
  const a = path.join(sdkDir, "call-AAA.js");
  const b = path.join(sdkDir, "call-BBB.js");
  fs.writeFileSync(a, "");
  fs.writeFileSync(b, "");
  const result = resolveSdkPath({ env: {}, cwd: dir });
  assert.match(result.path, /call-(AAA|BBB)\.js$/);
  assert.equal(result.source, "workspace-glob");
});

test("global fallback emits warning", () => {
  const dir = tmp();
  const globalRoot = tmp();
  const sdkDir = path.join(globalRoot, "openclaw", "dist");
  fs.mkdirSync(sdkDir, { recursive: true });
  const file = path.join(sdkDir, "call-GLOBAL.js");
  fs.writeFileSync(file, "");
  const warnings: string[] = [];
  const result = resolveSdkPath({
    env: {},
    cwd: dir,
    globalNpmRoot: () => globalRoot,
    warn: (m) => warnings.push(m),
  });
  assert.equal(result.source, "global-fallback");
  assert.equal(result.path, file);
  assert.ok(warnings[0].includes("global"));
});

test("throws with setup hint when nothing found", () => {
  const dir = tmp();
  assert.throws(
    () => resolveSdkPath({ env: {}, cwd: dir, globalNpmRoot: () => tmp() }),
    /Could not resolve OpenClaw SDK/
  );
});
```

- [ ] **Step 2.2: Run test, confirm fails**

```bash
pnpm --filter bridge exec node --test test/resolve-sdk.test.ts
```

Expected: ENOENT or "Cannot find module" for `resolve-sdk.js`.

- [ ] **Step 2.3: Implement resolver**

Create `apps/bridge/src/openclaw/resolve-sdk.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

export interface ResolveSdkOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  globalNpmRoot?: () => string;
  warn?: (msg: string) => void;
}

export type ResolveSource = "env-override" | "workspace-package" | "workspace-glob" | "global-fallback";

export interface ResolveSdkResult {
  path: string;
  source: ResolveSource;
}

const ENV_VAR = "OPENCLAW_SDK_PATH";
const SETUP_HINT =
  "Could not resolve OpenClaw SDK.\n" +
  "  Install in this workspace:  pnpm --filter bridge add openclaw\n" +
  `  Or set ${ENV_VAR}=/abs/path/to/dist/call-*.js`;

export function resolveSdkPath(opts: ResolveSdkOptions = {}): ResolveSdkResult {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const warn = opts.warn ?? ((m) => console.warn(m));

  // 1. Env override.
  const override = env[ENV_VAR];
  if (override && fs.existsSync(override)) {
    return { path: override, source: "env-override" };
  }

  // 2. Stable package entry, if openclaw ever ships one.
  try {
    const pkgJson = require.resolve("openclaw/package.json", { paths: [cwd] });
    const pkg = JSON.parse(fs.readFileSync(pkgJson, "utf8"));
    if (pkg.exports || pkg.main) {
      const dir = path.dirname(pkgJson);
      const main = pkg.main ?? "dist/index.js";
      const stable = path.resolve(dir, typeof pkg.main === "string" ? main : "dist/index.js");
      if (fs.existsSync(stable)) {
        return { path: stable, source: "workspace-package" };
      }
    }
  } catch {
    // not installed locally with stable export — fall through
  }

  // 3. Workspace glob fallback for hash-versioned bundles.
  const localGlob = globCallStar(path.join(cwd, "node_modules", "openclaw", "dist"));
  if (localGlob) return { path: localGlob, source: "workspace-glob" };

  // 4. Global npm root glob — emit warning, this is unsupported long-term.
  const globalRootFn = opts.globalNpmRoot ?? defaultGlobalNpmRoot;
  let globalRoot: string;
  try {
    globalRoot = globalRootFn();
  } catch {
    globalRoot = "";
  }
  if (globalRoot) {
    const globalGlob = globCallStar(path.join(globalRoot, "openclaw", "dist"));
    if (globalGlob) {
      warn(
        `[openclaw] Resolved SDK from global npm install at ${globalGlob}. ` +
        "This is a transitional fallback. Prefer a workspace dependency or set " +
        `${ENV_VAR}.`
      );
      return { path: globalGlob, source: "global-fallback" };
    }
  }

  throw new Error(SETUP_HINT);
}

function globCallStar(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir);
  const matches = entries
    .filter((e) => /^call-[^/]+\.js$/.test(e))
    .map((e) => path.join(dir, e))
    .sort();
  return matches[0] ?? null;
}

function defaultGlobalNpmRoot(): string {
  return execSync("npm root -g", { encoding: "utf8" }).trim();
}
```

- [ ] **Step 2.4: Run resolver tests, confirm pass**

```bash
pnpm --filter bridge build
pnpm --filter bridge exec node --test dist/test/resolve-sdk.test.js
```

Expected: 4 passing.

- [ ] **Step 2.5: Write failing test for config defaults**

Create `apps/bridge/test/config-defaults.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { computeDefaults } from "../src/config.js";

test("defaults derive from os.homedir() when env unset", () => {
  const home = "/fake/home";
  const d = computeDefaults({ env: {}, homedir: () => home });
  assert.equal(d.openclawHome, path.join(home, ".openclaw"));
  assert.equal(
    d.managementDir,
    path.join(home, ".openclaw/workspace/.openclaw/extensions/whatsapp-auto-reply/management"),
  );
  assert.equal(
    d.brainVaultPath,
    path.join(home, "Documents/Brainclaw/OpenClaw Brain"),
  );
});

test("OPENCLAW_HOME override propagates to derived paths", () => {
  const d = computeDefaults({
    env: { OPENCLAW_HOME: "/custom/oc" },
    homedir: () => "/fake/home",
  });
  assert.equal(d.openclawHome, "/custom/oc");
  assert.ok(d.managementDir.startsWith("/custom/oc/"));
});

test("Hermes disabled when HERMES_BASE_URL absent", () => {
  const d = computeDefaults({ env: {}, homedir: () => "/h" });
  assert.equal(d.hermesEnabled, false);
});

test("Hermes enabled when HERMES_BASE_URL present", () => {
  const d = computeDefaults({
    env: { HERMES_BASE_URL: "http://hermes:9119", HERMES_TOKEN: "tk" },
    homedir: () => "/h",
  });
  assert.equal(d.hermesEnabled, true);
});

test("BRIDGE_HOST defaults to 127.0.0.1", () => {
  const d = computeDefaults({ env: {}, homedir: () => "/h" });
  assert.equal(d.bridgeHost, "127.0.0.1");
});
```

- [ ] **Step 2.6: Run, confirm fails**

```bash
pnpm --filter bridge exec node --test test/config-defaults.test.ts
```

Expected: `computeDefaults` undefined.

- [ ] **Step 2.7: Refactor `apps/bridge/src/config.ts`**

Add at top of file (after imports):

```ts
import os from "node:os";
import { resolveSdkPath } from "./openclaw/resolve-sdk.js";

export interface ComputeDefaultsArgs {
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
}

export function computeDefaults(args: ComputeDefaultsArgs = {}) {
  const env = args.env ?? process.env;
  const homedir = (args.homedir ?? os.homedir)();
  const openclawHome = env.OPENCLAW_HOME || path.join(homedir, ".openclaw");
  const pluginRoot = path.join(
    openclawHome,
    "workspace/.openclaw/extensions/whatsapp-auto-reply",
  );
  const managementDir = env.MANAGEMENT_DIR || path.join(pluginRoot, "management");
  return {
    bridgeHost: env.BRIDGE_HOST || "127.0.0.1",
    bridgePort: Number(env.BRIDGE_PORT) || 3100,
    openclawHome,
    openclawStatePath:
      env.OPENCLAW_STATE_PATH ||
      path.join(pluginRoot, "whatsapp-auto-reply-state.json"),
    managementDir,
    sessionsDir:
      env.OPENCLAW_SESSIONS_DIR || path.join(openclawHome, "agents/main/sessions"),
    brainVaultPath:
      env.BRAIN_VAULT_PATH || path.join(homedir, "Documents/Brainclaw/OpenClaw Brain"),
    reviewerScanRoots: (
      env.REVIEWER_SCAN_ROOTS ||
      env.REVIEWER_SCAN_ROOT ||
      path.join(homedir, "Documents")
    )
      .split(/[;]/)
      .map((s) => s.trim())
      .filter(Boolean),
    hermesEnabled: !!env.HERMES_BASE_URL,
    hermesBaseUrl: env.HERMES_BASE_URL || null,
    hermesToken: env.HERMES_TOKEN || null,
  };
}
```

Replace the existing `config` object so each value reads from `computeDefaults()`. Required env (validated via aggregator):

```ts
function aggregateMissing(env: NodeJS.ProcessEnv): string[] {
  const missing: string[] = [];
  if (!env.BRIDGE_TOKEN) missing.push("BRIDGE_TOKEN");
  if (!env.OPENCLAW_GATEWAY_TOKEN) missing.push("OPENCLAW_GATEWAY_TOKEN");
  if (!env.AUTH_ASSERTION_SECRET || env.AUTH_ASSERTION_SECRET.length < 32) {
    missing.push("AUTH_ASSERTION_SECRET (>=32 chars)");
  }
  return missing;
}

const missing = aggregateMissing(process.env);
if (missing.length > 0) {
  throw new Error(
    "Bridge configuration incomplete. Missing or invalid:\n  - " +
    missing.join("\n  - ") +
    "\n\nRun `pnpm setup` from the repo root to generate apps/bridge/.env."
  );
}

const defaults = computeDefaults();
const sdkResolution = resolveSdkPath();

export const config = {
  ...defaults,
  token: process.env.BRIDGE_TOKEN!,
  serviceId: process.env.BRIDGE_SERVICE_ID || "bridge-primary",
  gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:18789",
  gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN!,
  openclawSdkPath: sdkResolution.path,
  openclawSdkSource: sdkResolution.source,
  // ...all existing reviewer/youtube/auth/etc fields preserved...
} as const;
```

Preserve every existing config field. Do not break the type structure used by callers. The change is **defaults**, not surface area.

- [ ] **Step 2.8: Replace direct env reads of OPENCLAW_SDK_PATH**

```bash
# Find call sites:
```

Use Grep tool: `process\.env\.OPENCLAW_SDK_PATH`. For each hit, change to `config.openclawSdkPath`.

- [ ] **Step 2.9: Run config tests**

```bash
pnpm --filter bridge build
pnpm --filter bridge exec node --test dist/test/config-defaults.test.js
```

Expected: 5 passing.

- [ ] **Step 2.10: Run full bridge test suite**

```bash
pnpm --filter bridge test
```

Expected: all existing tests pass; no regressions.

- [ ] **Step 2.11: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(bridge): config defaults from os.homedir(), SDK resolver

computeDefaults() derives all path defaults from os.homedir()/OPENCLAW_HOME.
resolveSdkPath() handles five-step fallback (env override → workspace package
→ workspace glob → global glob with warning → throw with setup hint).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Hermes optionality + manager-owned runtimes.json

**Branch:** `Gal/global-task-3-hermes-optional`
**Owner subagent:** general-purpose
**Files:**
- Modify: `apps/bridge/src/server.ts:42` and `apps/bridge/src/server.ts:116-120` — Hermes copilot backend creation guarded by `config.hermesEnabled`; runtime registry resolves from manager-owned config first
- Modify: `apps/bridge/src/services/runtimes/registry.ts` — accept multiple config-path candidates
- Modify: `apps/bridge/src/services/copilot/backends/hermes.ts` — adapter accepts null config; returns `{ available: false, reason: "..." }` for invocations
- Create: `apps/bridge/config/runtimes.json` (empty seed: `{ "runtimes": [] }`)
- Modify: `apps/bridge/src/config.ts` — add `runtimesConfigPaths: string[]` (manager-owned first, plugin fallback second)
- Create: `apps/bridge/test/hermes-disabled.test.ts`
- Create: `apps/bridge/test/runtimes-config-precedence.test.ts`

- [ ] **Step 3.1: Write failing test for Hermes-disabled boot**

Create `apps/bridge/test/hermes-disabled.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHermesChatBackend } from "../src/services/copilot/backends/hermes.js";

test("createHermesChatBackend(null) yields disabled backend", () => {
  const backend = createHermesChatBackend(null);
  assert.equal(backend.available, false);
  assert.match(backend.reason ?? "", /HERMES_BASE_URL/);
});

test("createHermesChatBackend(config) yields enabled backend", () => {
  const backend = createHermesChatBackend({
    baseUrl: "http://h:9119",
    token: "t",
  });
  assert.equal(backend.available, true);
});
```

- [ ] **Step 3.2: Confirm test fails**

```bash
pnpm --filter bridge exec node --test test/hermes-disabled.test.ts
```

- [ ] **Step 3.3: Modify Hermes backend factory**

Read current `apps/bridge/src/services/copilot/backends/hermes.ts`. Adjust so:

```ts
export interface HermesBackendConfig {
  baseUrl: string;
  token: string | null;
}

export interface HermesBackend {
  available: boolean;
  reason?: string;
  // ...existing methods kept, gated by available
}

export function createHermesChatBackend(cfg: HermesBackendConfig | null): HermesBackend {
  if (!cfg || !cfg.baseUrl) {
    return {
      available: false,
      reason: "HERMES_BASE_URL is not set",
    };
  }
  // ...existing implementation, returning available: true
}
```

Update copilot orchestrator to skip Hermes branch when `!backend.available`.

- [ ] **Step 3.4: Confirm Hermes test passes**

```bash
pnpm --filter bridge exec node --test dist/test/hermes-disabled.test.js
```

- [ ] **Step 3.5: Add manager-owned runtimes.json read precedence**

In `apps/bridge/src/config.ts`:

```ts
runtimesConfigPaths: [
  process.env.RUNTIMES_CONFIG_PATH,
  path.resolve(process.cwd(), "apps/bridge/config/runtimes.json"),
  path.resolve(__dirname, "../config/runtimes.json"),
  path.join(defaults.managementDir, "runtimes.json"), // legacy plugin location
].filter(Boolean) as string[],
```

(Adjust `__dirname` for ESM as needed: `import { fileURLToPath } from "node:url"; const __dirname = path.dirname(fileURLToPath(import.meta.url));`)

- [ ] **Step 3.6: Update registry to try paths in order**

In `apps/bridge/src/services/runtimes/registry.ts`, find where it reads `configPath`. Change `createRuntimeRegistry` signature to accept `configPaths: string[]` and pick the first that exists. Log which path was used at boot.

In `apps/bridge/src/server.ts`:

```ts
const runtimeRegistry = await createRuntimeRegistry({
  configPaths: config.runtimesConfigPaths,
  factories: realFactories,
});
```

- [ ] **Step 3.7: Write precedence test**

Create `apps/bridge/test/runtimes-config-precedence.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("registry reads first existing path", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ocm-rt-"));
  const a = path.join(dir, "a.json");
  const b = path.join(dir, "b.json");
  fs.writeFileSync(a, JSON.stringify({ runtimes: [{ id: "from-a", kind: "openclaw", endpoint: "x", transport: "sdk", authMode: "token-env" }] }));
  fs.writeFileSync(b, JSON.stringify({ runtimes: [{ id: "from-b", kind: "openclaw", endpoint: "x", transport: "sdk", authMode: "token-env" }] }));
  const { createRuntimeRegistry } = await import("../src/services/runtimes/registry.js");
  const reg = await createRuntimeRegistry({
    configPaths: [a, b],
    factories: { openclaw: () => ({ describeRuntime: async () => ({ id: "from-a", kind: "openclaw", endpoint: "x", transport: "sdk", authMode: "token-env" }) } as any) },
  });
  const list = await reg.list();
  assert.equal(list[0].id, "from-a");
});
```

- [ ] **Step 3.8: Run, confirm pass**

```bash
pnpm --filter bridge build
pnpm --filter bridge test
```

- [ ] **Step 3.9: Create empty manager-owned seed**

Write `apps/bridge/config/runtimes.json`:

```json
{
  "runtimes": [
    {
      "id": "oc-main",
      "kind": "openclaw",
      "displayName": "OpenClaw (local)",
      "endpoint": "http://127.0.0.1:18789",
      "transport": "sdk",
      "authMode": "token-env",
      "notes": "Default OpenClaw runtime. Generated by `pnpm setup`. Edit at apps/bridge/config/runtimes.json."
    }
  ]
}
```

Add this file to git (committed default; setup wizard regenerates with user's chosen Hermes settings).

- [ ] **Step 3.10: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(bridge): Hermes optional, manager-owned runtimes.json canonical

Hermes copilot backend accepts null config and reports disabled gracefully.
Runtime registry resolves apps/bridge/config/runtimes.json first; legacy
plugin file is fallback only. Bridge boots cleanly without HERMES_BASE_URL.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Setup wizard + doctor + dashboard env precedence

**Depends on:** Task 2 (uses `computeDefaults` and `resolveSdkPath`).
**Branch:** `Gal/global-task-4-setup-wizard`
**Owner subagent:** general-purpose
**Files:**
- Create: `scripts/setup.ts` (cross-platform Node script, run via `tsx`)
- Create: `scripts/doctor.ts`
- Create: `scripts/lib/secrets.ts` (random hex + readable wordlist)
- Create: `scripts/lib/ports.ts` (free-port detection)
- Create: `scripts/lib/openclaw-discover.ts` (find OpenClaw home, gateway token from openclaw.json)
- Create: `scripts/test/setup.test.ts`
- Modify: root `package.json` — add `setup` and `doctor` scripts; add `tsx` to root devDeps; add `engines` and `packageManager` (deferred to Task 6 if collision); add `concurrently` for `pnpm dev`
- Modify: `apps/dashboard/next.config.ts` — ensure Next loads `.env.local` then `.env` (Next does this by default; verify and document)
- Modify: `apps/dashboard/.gitignore` — add `.env.local` if not already present
- Modify: `apps/bridge/.gitignore` — ensure `.env` is gitignored

- [ ] **Step 4.1: Add `tsx` and `concurrently` to root devDependencies**

```bash
pnpm add -Dw tsx concurrently
```

- [ ] **Step 4.2: Create `scripts/lib/secrets.ts`**

```ts
import crypto from "node:crypto";

const WORDS = [
  "amber","banyan","cobalt","dahlia","ember","fjord","ginger","harbor",
  "indigo","juniper","kelp","linden","maple","nebula","ochre","pomegranate",
  "quartz","river","saffron","tundra","umber","violet","willow","xanadu",
  "yarrow","zephyr","azure","beacon","cinder","drift",
] as const;

export function randomHex(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function readablePassword(): string {
  const a = WORDS[crypto.randomInt(WORDS.length)];
  const b = WORDS[crypto.randomInt(WORDS.length)];
  const n = crypto.randomInt(10, 100);
  return `${a}-${b}-${n}`;
}
```

- [ ] **Step 4.3: Create `scripts/lib/ports.ts`**

```ts
import net from "node:net";

export function isPortFree(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

export async function pickFreePort(preferred: number, host = "127.0.0.1"): Promise<number> {
  if (await isPortFree(preferred, host)) return preferred;
  for (let p = preferred + 1; p < preferred + 50; p++) {
    if (await isPortFree(p, host)) return p;
  }
  throw new Error(`No free port found near ${preferred}`);
}
```

- [ ] **Step 4.4: Create `scripts/lib/openclaw-discover.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface OpenClawDiscovery {
  home: string | null;
  gatewayToken: string | null;
}

export function discoverOpenClaw(home?: string): OpenClawDiscovery {
  const candidate = home || process.env.OPENCLAW_HOME || path.join(os.homedir(), ".openclaw");
  const configPath = path.join(candidate, "openclaw.json");
  if (!fs.existsSync(configPath)) {
    return { home: null, gatewayToken: null };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const token = raw?.gateway?.token ?? raw?.gatewayToken ?? null;
    return { home: candidate, gatewayToken: token };
  } catch {
    return { home: candidate, gatewayToken: null };
  }
}

export function toForwardSlash(p: string): string {
  return p.replace(/\\/g, "/");
}
```

- [ ] **Step 4.5: Create `scripts/setup.ts`**

```ts
#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { randomHex, readablePassword } from "./lib/secrets.js";
import { pickFreePort } from "./lib/ports.js";
import { discoverOpenClaw, toForwardSlash } from "./lib/openclaw-discover.js";

interface Args {
  yes: boolean;
  nonInteractive: boolean;
  resetAdminPassword: boolean;
  resetRuntimes: boolean;
  bridgePort: number | null;
  dashboardPort: number | null;
  openclawHome: string | null;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    yes: false, nonInteractive: false, resetAdminPassword: false, resetRuntimes: false,
    bridgePort: null, dashboardPort: null, openclawHome: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--yes" || v === "-y") a.yes = true;
    else if (v === "--non-interactive") { a.nonInteractive = true; a.yes = true; }
    else if (v === "--reset-admin-password") a.resetAdminPassword = true;
    else if (v === "--reset-runtimes") a.resetRuntimes = true;
    else if (v === "--bridge-port") a.bridgePort = Number(argv[++i]);
    else if (v === "--dashboard-port") a.dashboardPort = Number(argv[++i]);
    else if (v === "--openclaw-home") a.openclawHome = argv[++i];
  }
  return a;
}

interface Answers {
  bridgePort: number;
  dashboardPort: number;
  openclawHome: string;
  gatewayToken: string;
  hermesEnabled: boolean;
  hermesBaseUrl: string;
  hermesToken: string;
}

async function prompt(rl: readline.Interface, q: string, fallback: string): Promise<string> {
  const ans = await rl.question(`${q}${fallback ? ` [${fallback}]` : ""}: `);
  return ans.trim() || fallback;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, "..");
  const bridgeEnvPath = path.join(repoRoot, "apps/bridge/.env");
  const dashboardEnvPath = path.join(repoRoot, "apps/dashboard/.env.local");
  const runtimesPath = path.join(repoRoot, "apps/bridge/config/runtimes.json");

  console.log("OpenClaw-Manager setup\n");

  // Pre-flight: Node and pnpm versions
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < 20) {
    console.error(`Node ${process.version} found; need >= 20.11. Aborting.`);
    process.exit(1);
  }

  // Discover OpenClaw
  const discovered = discoverOpenClaw(args.openclawHome ?? undefined);
  const defaultHome = args.openclawHome || discovered.home || path.join(os.homedir(), ".openclaw");

  let answers: Answers;
  if (args.yes) {
    answers = {
      bridgePort: args.bridgePort ?? await pickFreePort(3100),
      dashboardPort: args.dashboardPort ?? await pickFreePort(3000),
      openclawHome: defaultHome,
      gatewayToken: discovered.gatewayToken ?? "",
      hermesEnabled: false,
      hermesBaseUrl: "",
      hermesToken: "",
    };
  } else {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    try {
      answers = {
        bridgePort: Number(await prompt(rl, "Bridge port", String(await pickFreePort(args.bridgePort ?? 3100)))),
        dashboardPort: Number(await prompt(rl, "Dashboard port", String(await pickFreePort(args.dashboardPort ?? 3000)))),
        openclawHome: await prompt(rl, "OpenClaw home", defaultHome),
        gatewayToken: discovered.gatewayToken ?? await prompt(rl, "OpenClaw gateway token (paste from your OpenClaw config)", ""),
        hermesEnabled: (await prompt(rl, "Enable a remote Hermes runtime? (y/N)", "N")).toLowerCase().startsWith("y"),
        hermesBaseUrl: "",
        hermesToken: "",
      };
      if (answers.hermesEnabled) {
        answers.hermesBaseUrl = await prompt(rl, "Hermes base URL", "http://127.0.0.1:9119");
        answers.hermesToken = await prompt(rl, "Hermes bearer token", "");
      }
    } finally {
      rl.close();
    }
  }

  // Generate secrets
  const bridgeToken = randomHex(32);
  const sessionSecret = randomHex(32);
  const authAssertionSecret = randomHex(32);
  const authBootstrapToken = randomHex(16);
  const adminPassword = readablePassword();

  // Idempotency check
  if (fs.existsSync(bridgeEnvPath) && !args.yes) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const ok = await rl.question(`${bridgeEnvPath} exists. Overwrite? [y/N]: `);
    rl.close();
    if (!ok.trim().toLowerCase().startsWith("y")) {
      console.log("Aborted. Existing files untouched.");
      process.exit(0);
    }
  }

  // Write bridge .env
  const bridgeEnv = renderBridgeEnv({
    host: "127.0.0.1",
    port: answers.bridgePort,
    bridgeToken,
    openclawHome: toForwardSlash(answers.openclawHome),
    gatewayToken: answers.gatewayToken,
    authAssertionSecret,
    authBootstrapToken,
    hermesBaseUrl: answers.hermesEnabled ? answers.hermesBaseUrl : "",
    hermesToken: answers.hermesEnabled ? answers.hermesToken : "",
  });
  fs.mkdirSync(path.dirname(bridgeEnvPath), { recursive: true });
  fs.writeFileSync(bridgeEnvPath, bridgeEnv, { mode: 0o600 });
  console.log(`Wrote ${bridgeEnvPath}`);

  // Write dashboard .env.local
  const dashEnv = renderDashboardEnv({
    bridgeUrl: `http://127.0.0.1:${answers.bridgePort}`,
    bridgeToken,
    authAssertionSecret,
    sessionSecret,
    cookieSecure: false,
  });
  fs.mkdirSync(path.dirname(dashboardEnvPath), { recursive: true });
  fs.writeFileSync(dashboardEnvPath, dashEnv, { mode: 0o600 });
  console.log(`Wrote ${dashboardEnvPath}`);

  // Regenerate manager-owned runtimes.json
  const runtimes: any[] = [{
    id: "oc-main", kind: "openclaw", displayName: "OpenClaw (local)",
    endpoint: "http://127.0.0.1:18789", transport: "sdk", authMode: "token-env",
    notes: "Default OpenClaw runtime. Edit this file or rerun `pnpm setup` to change.",
  }];
  if (answers.hermesEnabled) {
    runtimes.push({
      id: "hermes-remote", kind: "hermes", displayName: "Hermes (remote)",
      endpoint: answers.hermesBaseUrl, transport: "http", authMode: "bearer",
      healthPath: "/v1/health",
    });
  }
  fs.mkdirSync(path.dirname(runtimesPath), { recursive: true });
  fs.writeFileSync(runtimesPath, JSON.stringify({ runtimes }, null, 2));
  console.log(`Wrote ${runtimesPath}`);

  // Seed plugin runtimes.json only if absent
  const pluginRuntimesPath = path.join(answers.openclawHome, "workspace/.openclaw/extensions/whatsapp-auto-reply/management/runtimes.json");
  if (fs.existsSync(pluginRuntimesPath)) {
    console.log(`Note: ${pluginRuntimesPath} already exists; left untouched. Manager-owned config above is authoritative.`);
  } else if (fs.existsSync(path.dirname(pluginRuntimesPath))) {
    fs.writeFileSync(pluginRuntimesPath, JSON.stringify({ runtimes }, null, 2));
    console.log(`Seeded plugin file: ${pluginRuntimesPath}`);
  }

  console.log("\nGenerated admin password (write it down; bootstrap with it once):\n");
  console.log(`    ${adminPassword}`);
  console.log("\nNext:\n  pnpm dev\n");
  console.log(`Then visit http://localhost:${answers.dashboardPort}/bootstrap to create the admin user.`);
  console.log(`Bootstrap token: ${authBootstrapToken}`);
}

function renderBridgeEnv(v: {
  host: string; port: number; bridgeToken: string; openclawHome: string; gatewayToken: string;
  authAssertionSecret: string; authBootstrapToken: string;
  hermesBaseUrl: string; hermesToken: string;
}): string {
  return `# Generated by \`pnpm setup\`. Edit freely; rerun setup to regenerate.
BRIDGE_HOST=${v.host}
BRIDGE_PORT=${v.port}
BRIDGE_TOKEN=${v.bridgeToken}
BRIDGE_SERVICE_ID=bridge-primary

OPENCLAW_HOME=${v.openclawHome}
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=${v.gatewayToken}

AUTH_ASSERTION_SECRET=${v.authAssertionSecret}
AUTH_BOOTSTRAP_TOKEN=${v.authBootstrapToken}

HERMES_BASE_URL=${v.hermesBaseUrl}
HERMES_TOKEN=${v.hermesToken}
`;
}

function renderDashboardEnv(v: {
  bridgeUrl: string; bridgeToken: string; authAssertionSecret: string;
  sessionSecret: string; cookieSecure: boolean;
}): string {
  return `# Generated by \`pnpm setup\`. Edit freely; rerun setup to regenerate.
OPENCLAW_BRIDGE_URL=${v.bridgeUrl}
OPENCLAW_BRIDGE_TOKEN=${v.bridgeToken}
AUTH_ASSERTION_SECRET=${v.authAssertionSecret}
SESSION_SECRET=${v.sessionSecret}
COOKIE_SECURE=${v.cookieSecure ? "true" : "false"}
`;
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4.6: Create `scripts/doctor.ts`**

```ts
#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

interface Check { name: string; ok: boolean; detail: string; }

async function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const checks: Check[] = [];

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push({
    name: "Node version",
    ok: nodeMajor >= 20,
    detail: `${process.version} (need >= 20.11)`,
  });

  const bridgeEnv = path.join(repoRoot, "apps/bridge/.env");
  const dashEnv = path.join(repoRoot, "apps/dashboard/.env.local");
  checks.push({ name: "apps/bridge/.env", ok: fs.existsSync(bridgeEnv), detail: bridgeEnv });
  checks.push({ name: "apps/dashboard/.env.local", ok: fs.existsSync(dashEnv), detail: dashEnv });

  const port = Number(parseEnv(bridgeEnv, "BRIDGE_PORT") || 3100);
  checks.push(await tcpProbe(`Bridge /health on 127.0.0.1:${port}`, `http://127.0.0.1:${port}/health`));

  const gateway = parseEnv(bridgeEnv, "OPENCLAW_GATEWAY_URL") || "http://127.0.0.1:18789";
  checks.push(await tcpProbe(`OpenClaw gateway ${gateway}`, gateway, true));

  const hermesUrl = parseEnv(bridgeEnv, "HERMES_BASE_URL");
  if (hermesUrl) {
    checks.push(await tcpProbe(`Hermes shim ${hermesUrl}/v1/health`, `${hermesUrl}/v1/health`, true));
  } else {
    checks.push({ name: "Hermes", ok: true, detail: "not configured (skipped)" });
  }

  for (const c of checks) {
    const tag = c.ok ? "OK " : "X  ";
    console.log(`${tag} ${c.name}  -  ${c.detail}`);
  }
  const required = checks.filter((c) => !c.name.startsWith("OpenClaw gateway") && !c.name.startsWith("Hermes"));
  process.exit(required.every((c) => c.ok) ? 0 : 1);
}

function parseEnv(p: string, key: string): string {
  if (!fs.existsSync(p)) return "";
  const raw = fs.readFileSync(p, "utf8");
  const m = raw.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m?.[1]?.trim() ?? "";
}

function tcpProbe(name: string, url: string, soft = false): Promise<Check> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve({ name, ok: true, detail: `HTTP ${res.statusCode}` });
      res.resume();
    });
    req.on("error", (e) => {
      resolve({ name, ok: soft, detail: soft ? `unreachable (${e.message}) — informational only` : e.message });
    });
    req.setTimeout(2000, () => { req.destroy(); resolve({ name, ok: soft, detail: soft ? "timeout — informational only" : "timeout" }); });
  });
}

main();
```

- [ ] **Step 4.7: Add root scripts to `package.json`**

```json
{
  "scripts": {
    "setup": "tsx scripts/setup.ts",
    "doctor": "tsx scripts/doctor.ts",
    "dev": "concurrently -n bridge,dashboard -c blue,green \"pnpm --filter bridge dev\" \"pnpm --filter dashboard dev\"",
    "dev:bridge": "pnpm --filter bridge dev",
    "dev:dashboard": "pnpm --filter dashboard dev",
    "build": "pnpm -r build",
    "build:dashboard": "pnpm --filter dashboard build",
    "build:bridge": "pnpm --filter bridge build",
    "smoke:youtube": "node scripts/smoke-youtube-v2.mjs",
    "smoke:runtimes": "node scripts/smoke-runtimes.mjs"
  }
}
```

- [ ] **Step 4.8: Verify Next.js loads `.env.local` then `.env`**

Next.js 15 default behavior: `.env.local` overrides `.env`. Verify by checking `apps/dashboard/next.config.ts` for any custom `env` loading. If custom loader exists, ensure `.env.local` precedence. Add `.env.local` to `apps/dashboard/.gitignore` if absent.

- [ ] **Step 4.9: Write setup wizard test**

Create `scripts/test/setup.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomHex, readablePassword } from "../lib/secrets.js";
import { discoverOpenClaw, toForwardSlash } from "../lib/openclaw-discover.js";
import { isPortFree, pickFreePort } from "../lib/ports.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("randomHex generates 64 hex chars by default", () => {
  const h = randomHex();
  assert.equal(h.length, 64);
  assert.match(h, /^[0-9a-f]+$/);
});

test("randomHex two calls differ", () => {
  assert.notEqual(randomHex(), randomHex());
});

test("readablePassword has shape word-word-NN", () => {
  const p = readablePassword();
  assert.match(p, /^[a-z]+-[a-z]+-\d{2}$/);
});

test("toForwardSlash normalizes Windows paths", () => {
  assert.equal(toForwardSlash("C:\\Users\\x"), "C:/Users/x");
});

test("discoverOpenClaw returns nulls when no openclaw.json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ocm-disc-"));
  const r = discoverOpenClaw(dir);
  assert.equal(r.gatewayToken, null);
});

test("discoverOpenClaw extracts token from openclaw.json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ocm-disc-"));
  fs.writeFileSync(path.join(dir, "openclaw.json"), JSON.stringify({ gateway: { token: "T123" } }));
  const r = discoverOpenClaw(dir);
  assert.equal(r.gatewayToken, "T123");
});

test("pickFreePort returns a port", async () => {
  const p = await pickFreePort(40000);
  assert.ok(p >= 40000 && p < 40050);
});
```

- [ ] **Step 4.10: Run tests**

```bash
pnpm exec tsx --test scripts/test/setup.test.ts
```

Expected: 7 passing.

- [ ] **Step 4.11: Manual smoke**

```bash
# In a tmp clone or after stashing existing .env files:
pnpm setup --yes --bridge-port 3100 --dashboard-port 3000 --openclaw-home $HOME/.openclaw
pnpm doctor
```

Expected:
- `apps/bridge/.env` and `apps/dashboard/.env.local` written.
- `apps/bridge/config/runtimes.json` regenerated.
- Doctor reports env files OK; bridge/health probably fails (bridge not started); OpenClaw gateway shows informational unreachable.

- [ ] **Step 4.12: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: pnpm setup wizard + doctor

scripts/setup.ts — cross-platform wizard. Detects free ports, generates
random secrets, derives OpenClaw home from openclaw.json, writes
apps/bridge/.env and apps/dashboard/.env.local, regenerates runtimes.json.

scripts/doctor.ts — read-only health checks for env files, bridge,
gateway, optional Hermes.

Root pnpm dev runs bridge + dashboard concurrently.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: PM2 + deploy doc reorg

**Branch:** `Gal/global-task-5-pm2-docs`
**Owner subagent:** general-purpose
**Files:**
- Create: `ecosystem.config.cjs`
- Modify: root `package.json` — add `pm2:start`, `pm2:restart`, `pm2:stop`, `pm2:logs` scripts
- Create: `docs/deploy/README.md` — index
- Create: `docs/deploy/pm2.md`
- Create: `docs/deploy/systemd.md` — extract CentOS systemd unit content (currently scattered in memory + comments)
- Create: `docs/deploy/windows-service.md` — NSSM-based recipe; reference scripts moved in Task 1
- Create: `docs/deploy/nginx.md`
- Create: `docs/deploy/advanced.md` — split-host topology, LAN exposure, security caveats

- [ ] **Step 5.1: Create `ecosystem.config.cjs`**

```js
// PM2 process manifest. Run from repo root after `pnpm build`:
//   pm2 start ecosystem.config.cjs
//   pm2 save && pm2 startup    # persist across reboots
module.exports = {
  apps: [
    {
      name: "openclaw-manager-bridge",
      cwd: "./apps/bridge",
      script: "dist/server.js",
      env: { NODE_ENV: "production" },
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      watch: false,
      time: true,
    },
    {
      name: "openclaw-manager-dashboard",
      cwd: "./apps/dashboard",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      env: { NODE_ENV: "production" },
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      watch: false,
      time: true,
    },
  ],
};
```

- [ ] **Step 5.2: Add PM2 scripts to root `package.json`**

```json
{
  "scripts": {
    "pm2:start": "pm2 start ecosystem.config.cjs",
    "pm2:restart": "pm2 restart ecosystem.config.cjs",
    "pm2:stop": "pm2 stop ecosystem.config.cjs",
    "pm2:logs": "pm2 logs --lines 200"
  }
}
```

- [ ] **Step 5.3: Create `docs/deploy/README.md`**

```markdown
# Deployment

For local dev: just run `pnpm dev` from the repo root.

For long-running production-style installs, pick one:

- [PM2 (recommended)](pm2.md) — single recipe for Win/Mac/Linux.
- [systemd (Linux)](systemd.md) — for Linux servers where you already run other systemd units.
- [Windows Service via NSSM](windows-service.md) — for Windows machines where you want the bridge to survive logoff. Has caveats; see doc.
- [Reverse proxy with nginx](nginx.md) — front the dashboard with TLS or a friendly URL.
- [Advanced: split-host topology](advanced.md) — bridge and dashboard on different machines.

The bridge defaults to binding `127.0.0.1`. Anything beyond single-host needs explicit configuration; see `advanced.md`.
```

- [ ] **Step 5.4: Create `docs/deploy/pm2.md`**

```markdown
# PM2

PM2 is the recommended process manager for OpenClaw-Manager because it works the same way on Windows, macOS, and Linux.

## Install PM2

\`\`\`
npm i -g pm2
\`\`\`

## First run

\`\`\`
pnpm install
pnpm setup
pnpm build
pm2 start ecosystem.config.cjs
\`\`\`

PM2 will start the bridge (port 3100 by default) and the dashboard (port 3000 by default). View logs:

\`\`\`
pm2 logs
pm2 status
\`\`\`

## Persist across reboots

\`\`\`
pm2 save
pm2 startup
\`\`\`

PM2 prints an OS-specific command (e.g., a systemd `enable` line on Linux, or a `Set-Service` line on Windows). Run that command, then `pm2 save` again. Reboot to verify.

## Updates

\`\`\`
git pull
pnpm install
pnpm build
pm2 restart ecosystem.config.cjs
\`\`\`

## Run as a specific user

The bridge must run as the same OS user that runs your OpenClaw install (the loopback gateway is bound to that user's session, and `~/.openclaw` resolves to that user's home).

If you want PM2 to run as a non-root system user, install and configure PM2 under that user's account, not root.
```

- [ ] **Step 5.5: Create `docs/deploy/systemd.md`, `docs/deploy/windows-service.md`, `docs/deploy/nginx.md`, `docs/deploy/advanced.md`**

Each file is a focused recipe. Content guidance:

**`systemd.md`** — A single `openclaw-manager.service` unit with `ExecStart=/usr/bin/pnpm pm2-runtime start ecosystem.config.cjs` (or a pair of units, one per app). Document `User=`, `WorkingDirectory=`, `EnvironmentFile=`. Note that `pm2-runtime` is preferable to plain `pm2` under systemd.

**`windows-service.md`** — Reference `docs/deploy/windows-service/scripts/install-bridge-service.ps1` (moved in Task 1). Note caveats: LocalSystem profile loses `~/.openclaw`, so run as the user instead, override `OPENCLAW_SDK_PATH` and `OPENCLAW_HOME` explicitly.

**`nginx.md`** — Reverse-proxy snippet:

```
server {
  listen 80;
  server_name dashboard.example.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

Note: enable `httpd_can_network_connect` on SELinux-enforcing systems.

**`advanced.md`** — Split-host setup. Bridge runs on the OpenClaw host, dashboard on a separate host. Set `BRIDGE_HOST=0.0.0.0` on the bridge, set `OPENCLAW_BRIDGE_URL=http://<bridge-private-ip>:3100` on the dashboard. Strongly recommend a private network (LAN/VPN); never expose the bridge to public internet without TLS + reverse proxy + tightened auth.

- [ ] **Step 5.6: Build sanity**

```bash
pnpm build
ls apps/bridge/dist/server.js
ls apps/dashboard/.next
```

Confirm both produce the artifacts referenced in `ecosystem.config.cjs`.

- [ ] **Step 5.7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
docs: PM2 default + deploy guides

Add ecosystem.config.cjs and pm2:* scripts. Reorganize deploy docs under
docs/deploy/ with PM2 as the recommended path; systemd, NSSM, nginx,
and split-host as advanced.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: README + INSTALL_README + SECURITY + LICENSE + engines

**Branch:** `Gal/global-task-6-top-level-docs`
**Owner subagent:** general-purpose
**Files:**
- Create: `README.md`
- Create: `INSTALL_README.md`
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`
- Create: `LICENSE` (MIT)
- Modify: root `package.json` — `name`, `description`, `engines`, `packageManager`, `keywords`, `repository`, `license`

- [ ] **Step 6.1: Update root `package.json` metadata**

Read current and modify:

```json
{
  "name": "openclaw-manager",
  "version": "0.1.0",
  "private": true,
  "description": "Multi-runtime control plane and dashboard for collaborative AI agents (OpenClaw + optional Hermes).",
  "license": "MIT",
  "engines": {
    "node": ">=20.11.0",
    "pnpm": ">=9.0.0"
  },
  "packageManager": "pnpm@9.15.0",
  "keywords": ["openclaw", "ai-agents", "control-plane", "dashboard", "hermes"],
  ...existing scripts and deps preserved
}
```

(Replace `9.15.0` with whatever pnpm version the lockfile pins. Inspect `pnpm-lock.yaml` first line.)

- [ ] **Step 6.2: Create `LICENSE`**

Standard MIT text. Copyright holder: "OpenClaw-Manager contributors". Year: 2026.

- [ ] **Step 6.3: Create `README.md`**

```markdown
# OpenClaw-Manager

A multi-runtime control plane and dashboard for collaborative AI agents. Run a local OpenClaw install, optionally talk to a remote Hermes runtime, manage conversations and runtime settings, and inspect activity — all from one operator UI.

## What it is

- **Bridge** (Express, port 3100): adapter layer between the dashboard and your AI runtimes. Talks to OpenClaw over its loopback WebSocket gateway, and optionally to a Hermes shim over HTTP.
- **Dashboard** (Next.js, port 3000): operator UI with password login. Server-side only — the browser never sees the bridge.

## Quick start

\`\`\`
pnpm install
pnpm setup
pnpm dev
\`\`\`

Then open `http://localhost:3000`.

The setup wizard generates random secrets, picks free ports, discovers your OpenClaw install, and asks (once) whether you want a remote Hermes runtime. See [INSTALL_README.md](INSTALL_README.md) for the full walkthrough.

## Requirements

- Node.js >= 20.11
- pnpm >= 9
- A running OpenClaw install on the same machine (the bridge needs filesystem access to OpenClaw's plugin state and a loopback gateway).

## Architecture

```
[Browser]
   │  http://localhost:3000
   ▼
[Dashboard (Next.js)]  ──server-side──>  [Bridge (Express)]  ──SDK ws──>  [OpenClaw Gateway]
                                          127.0.0.1:3100                  127.0.0.1:18789
```

Optional: Hermes runtime over HTTP+bearer.

## Production

For long-running installs, see [docs/deploy/pm2.md](docs/deploy/pm2.md). PM2 is the recommended cross-platform process manager.

For split-host setups (dashboard and bridge on different machines), see [docs/deploy/advanced.md](docs/deploy/advanced.md).

## Security

- Bridge binds `127.0.0.1` by default.
- Dashboard talks to bridge only from server code; `BRIDGE_TOKEN` never reaches the browser.
- All secrets are generated locally by `pnpm setup`. No telemetry, no phone-home.
- See [SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE).
```

- [ ] **Step 6.4: Create `INSTALL_README.md`**

```markdown
# OpenClaw-Manager — Install Guide

This guide walks you from a fresh clone to a working dashboard. It assumes you already have a running OpenClaw install on the same machine.

## 1. Prerequisites

- **Node.js 20.11 or newer.** Check: `node -v`. Install via [nvm](https://github.com/nvm-sh/nvm) on Mac/Linux or [nvm-windows](https://github.com/coreybutler/nvm-windows) on Windows.
- **pnpm 9 or newer.** Check: `pnpm -v`. Install: `npm i -g pnpm`.
- **A running OpenClaw install.** The bridge connects to OpenClaw's loopback gateway and reads plugin state from disk. If you don't have one yet, set that up first.

## 2. Clone and install

\`\`\`
git clone <your fork or upstream> openclaw-manager
cd openclaw-manager
pnpm install
\`\`\`

## 3. Run the setup wizard

\`\`\`
pnpm setup
\`\`\`

The wizard will:

1. Detect free ports (defaults: 3100 for the bridge, 3000 for the dashboard).
2. Find your OpenClaw install (defaults to `~/.openclaw`).
3. Read your OpenClaw gateway token from `~/.openclaw/openclaw.json` if present, otherwise prompt for it.
4. Ask whether to enable a remote **Hermes** runtime (default: no).
5. Generate `BRIDGE_TOKEN`, `AUTH_ASSERTION_SECRET`, `SESSION_SECRET`, `AUTH_BOOTSTRAP_TOKEN` (random hex), and an `ADMIN_PASSWORD` (readable phrase).
6. Write:
   - `apps/bridge/.env`
   - `apps/dashboard/.env.local`
   - `apps/bridge/config/runtimes.json`
7. Print your generated admin password and bootstrap token.

Non-interactive mode for CI / scripted installs:

\`\`\`
pnpm setup --yes
\`\`\`

Other flags:

\`\`\`
--bridge-port 3100
--dashboard-port 3000
--openclaw-home /custom/path/.openclaw
--reset-admin-password
--reset-runtimes
\`\`\`

## 4. Start the apps

\`\`\`
pnpm dev
\`\`\`

This runs the bridge and dashboard concurrently. Logs are colour-tagged.

In a separate terminal:

\`\`\`
pnpm doctor
\`\`\`

This checks that env files exist and parse, the bridge `/health` endpoint responds, and the OpenClaw gateway is reachable. The OpenClaw and Hermes checks are informational — if your gateway isn't running yet, the bridge will still boot and the dashboard will show OpenClaw as disconnected.

## 5. Bootstrap the admin user

Open `http://localhost:3000/bootstrap`.

Paste the bootstrap token printed by `pnpm setup`. Set a username and password. Submit.

The bootstrap endpoint is one-shot: after the first user exists, it returns 403.

Log in at `http://localhost:3000` with the credentials you just set.

## 6. Connect to OpenClaw

The dashboard's runtimes view should show `OpenClaw (local)` as connected. If it shows disconnected:

- Check that OpenClaw is actually running.
- Run `pnpm doctor` and read the report.
- Tail `apps/bridge` logs for `ECONNREFUSED 127.0.0.1:18789`.
- Verify the gateway token: `cat ~/.openclaw/openclaw.json | jq .gateway.token` (or open the file). It must match `OPENCLAW_GATEWAY_TOKEN` in `apps/bridge/.env`.

## 7. (Optional) Connect to Hermes

If you said "no" to Hermes during setup and want to add it later:

1. Edit `apps/bridge/.env`:
   ```
   HERMES_BASE_URL=http://your-hermes-host:9119
   HERMES_TOKEN=<bearer token>
   ```
2. Edit `apps/bridge/config/runtimes.json` to add a Hermes entry. (Or rerun `pnpm setup`.)
3. Restart the bridge: `pnpm --filter bridge dev` (or `pm2 restart openclaw-manager-bridge` in production).

## 8. Production install

For long-running installs that survive reboots, use PM2:

\`\`\`
npm i -g pm2
pnpm build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
\`\`\`

Run that last `pm2 startup` command's printed instruction, then `pm2 save` once more. Reboot to verify.

For systemd, NSSM, nginx reverse-proxy, or split-host topologies, see [docs/deploy/](docs/deploy/).

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `Bridge configuration incomplete. Missing or invalid: ...` | Run `pnpm setup`. Or copy `apps/bridge/.env.example` → `apps/bridge/.env` and fill in. |
| `Could not resolve OpenClaw SDK` | Either install OpenClaw inside the workspace (`pnpm --filter bridge add openclaw`), or set `OPENCLAW_SDK_PATH=/abs/path/to/dist/call-*.js` in `apps/bridge/.env`. |
| `AUTH_ASSERTION_SECRET must be set and >= 32 chars` | The bridge enforces this. Rerun `pnpm setup` to regenerate, or paste a 32+ char random hex into both `apps/bridge/.env` and `apps/dashboard/.env.local`. |
| Dashboard shows OpenClaw disconnected | OpenClaw isn't running, or the gateway token doesn't match. See §6. |
| Port 3000 or 3100 already in use | Pass `--bridge-port` / `--dashboard-port` to `pnpm setup`, or stop the conflicting process. |
| Windows: backslashes in `.env` look wrong | The wizard writes forward-slash paths on Windows for parser safety. They work fine. |
| Windows service version: bridge runs as LocalSystem and can't find `~/.openclaw` | Run the bridge under a real user account, not LocalSystem. See `docs/deploy/windows-service.md`. |

## Updating

\`\`\`
git pull
pnpm install
pnpm build
\`\`\`

If the upgrade changes config schema, rerun `pnpm setup`. Existing `.env` values you want to keep can be pasted back in; the wizard prompts before overwriting.
```

- [ ] **Step 6.5: Create `SECURITY.md`**

```markdown
# Security

## Threat model

OpenClaw-Manager is designed for **local, single-operator use**. The default install:

- Binds the bridge to `127.0.0.1`.
- Stores all secrets in local files (`apps/bridge/.env`, `apps/dashboard/.env.local`) gitignored from the repo.
- Authenticates dashboard users with a password + HMAC-signed cookie.
- Authenticates dashboard → bridge with a shared bearer token + HMAC-signed actor assertion.

## What you control

| Surface | Who can reach it (default) |
|---------|----------------------------|
| Dashboard `:3000` | Anyone who can reach the host on that port. **Restrict via firewall, reverse proxy, or VPN if multi-user.** |
| Bridge `:3100` | Loopback only by default. |
| OpenClaw gateway `:18789` | Loopback only (OpenClaw's own choice). |

If you set `BRIDGE_HOST=0.0.0.0` for a split-host install, **only do so on a private network**. The bridge token is the only auth on the bridge surface; if that token leaks and the bridge is internet-reachable, an attacker has full bridge access.

## Secrets

`pnpm setup` generates:

- `BRIDGE_TOKEN` (32-byte hex)
- `AUTH_ASSERTION_SECRET` (32-byte hex, shared bridge ↔ dashboard)
- `AUTH_BOOTSTRAP_TOKEN` (16-byte hex, one-shot)
- `SESSION_SECRET` (32-byte hex)
- `ADMIN_PASSWORD` (readable phrase, printed once to stdout)

These live in `.env` and `.env.local` files, both gitignored. Never commit them.

To rotate any secret, edit the relevant `.env` file (and mirror `BRIDGE_TOKEN` and `AUTH_ASSERTION_SECRET` to the dashboard) and restart both processes.

## Reporting vulnerabilities

Open a private security advisory on GitHub or email the maintainer. Do not file a public issue for security bugs.

## Hardening checklist

- [ ] TLS in front of the dashboard (nginx/caddy + Let's Encrypt).
- [ ] `COOKIE_SECURE=true` in `apps/dashboard/.env.local` once TLS is in place.
- [ ] Set up OIDC (`AUTH_OIDC_*` vars) and disable the legacy password path.
- [ ] Restrict bridge port at the OS firewall to the dashboard host's IP.
- [ ] Rotate `AUTH_BOOTSTRAP_TOKEN` (or unset it) after the first admin user is created.
```

- [ ] **Step 6.6: Create `CONTRIBUTING.md`**

```markdown
# Contributing

## Dev loop

\`\`\`
pnpm install
pnpm setup
pnpm dev
\`\`\`

## Tests

\`\`\`
pnpm --filter bridge test
pnpm --filter dashboard test
\`\`\`

Bridge uses `node:test`. Dashboard uses Vitest.

## Project layout

\`\`\`
apps/
  bridge/        Express HTTP bridge (port 3100)
  dashboard/     Next.js operator UI (port 3000)
packages/
  types/         Shared TypeScript contracts
  brain/         Knowledge vault layer
  mcp-openclaw/  MCP facade for OpenClaw
  mcp-hermes/    MCP facade for Hermes
scripts/
  setup.ts       pnpm setup wizard
  doctor.ts      pnpm doctor health check
docs/
  deploy/        Production deployment recipes
  history/       Archived design docs
  superpowers/   Specs and implementation plans
\`\`\`

## Style

- TypeScript strict.
- Prefer small focused files over large multi-purpose ones.
- Tests for any new module touching config, secrets, or runtime registry.
- Commits: short imperative subject, body explains why.

## Branches and PRs

- Feature branches: `Gal/<feature>` or `<your-name>/<feature>`.
- Open PRs against `main`. Squash-merge.

## License

By contributing you agree your code is licensed under the project's MIT license.
```

- [ ] **Step 6.7: Build, test, sanity-check**

```bash
pnpm install   # picks up engines/packageManager
pnpm -r build
pnpm --filter bridge test
```

- [ ] **Step 6.8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
docs: top-level README, INSTALL guide, SECURITY, CONTRIBUTING, LICENSE

Add public-facing docs for open-source consumers. Set engines >= Node 20.11
and pin pnpm version. License project under MIT.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: End-to-end fresh-clone smoke

**Depends on:** Tasks 1–6 merged.
**Branch:** `Gal/global-task-7-e2e-smoke`
**Owner subagent:** general-purpose

- [ ] **Step 7.1: Create scratch directory and clone fresh**

```bash
mkdir -p /tmp/ocm-smoke
cd /tmp/ocm-smoke
git clone <repo path> manager
cd manager
```

(On Windows, use `$env:TEMP\ocm-smoke` instead of `/tmp`.)

- [ ] **Step 7.2: Install**

```bash
pnpm install
```

Expected: clean install, lockfile satisfied, no engines warning.

- [ ] **Step 7.3: Run setup --yes against a synthetic OpenClaw home**

```bash
mkdir -p /tmp/fake-openclaw
cat > /tmp/fake-openclaw/openclaw.json <<EOF
{ "gateway": { "token": "fake-gateway-token-for-smoke" } }
EOF
pnpm setup --yes --openclaw-home /tmp/fake-openclaw
```

Expected stdout includes:
- `Wrote .../apps/bridge/.env`
- `Wrote .../apps/dashboard/.env.local`
- `Wrote .../apps/bridge/config/runtimes.json`
- An admin password phrase
- A bootstrap token

- [ ] **Step 7.4: Verify generated env files**

```bash
cat apps/bridge/.env
cat apps/dashboard/.env.local
cat apps/bridge/config/runtimes.json
```

Expected:
- `BRIDGE_TOKEN` is a 64-char hex string
- `AUTH_ASSERTION_SECRET` is a 64-char hex string and matches between the two files
- `BRIDGE_HOST=127.0.0.1`
- `OPENCLAW_HOME=/tmp/fake-openclaw` (or forward-slash Windows variant)
- No Hermes vars set (or empty)

- [ ] **Step 7.5: Build**

```bash
pnpm -r build
```

Expected: succeeds. `apps/bridge/dist/server.js` and `apps/dashboard/.next/` both exist.

- [ ] **Step 7.6: Doctor**

```bash
pnpm doctor
```

Expected:
- Node version OK
- env files OK
- Bridge `/health` fails (bridge not started — that's fine, doctor exits non-zero)
- OpenClaw gateway unreachable (informational, not red)
- Hermes "not configured (skipped)"

- [ ] **Step 7.7: Boot bridge in background, recheck**

```bash
pnpm --filter bridge dev &
BRIDGE_PID=$!
sleep 5
pnpm doctor
```

Expected: bridge `/health` now OK. Doctor exits 0 if everything required is green.

Kill bridge:

```bash
kill $BRIDGE_PID
```

- [ ] **Step 7.8: Audit doctor / setup / dev for any Gal-isms**

Re-run Task 1 grep on the working directory:

- `GalLe`
- `192\.168\.0\.`
- `OpenClaw-Bridge`
- `openclaw2026`
- `C:\\\\Users\\\\GalLe`

Expected: zero hits outside `docs/superpowers/specs/2026-05-10-global-distribution-design.md`, `docs/superpowers/plans/2026-05-10-global-distribution.md`, `docs/history/`.

- [ ] **Step 7.9: Document any rough edges**

Open `docs/superpowers/plans/2026-05-10-global-distribution.md` and append a short "Smoke results" section:

```markdown
## Smoke results (2026-05-10)

- Fresh-clone install: <status>
- Setup --yes: <status>
- Build: <status>
- Doctor: <status>
- Issues found: <list, or "none">
- Issues fixed in this branch: <list>
```

If issues are found, fix them in this same branch (or open follow-up tickets if too large).

- [ ] **Step 7.10: Commit**

```bash
git add docs/superpowers/plans/2026-05-10-global-distribution.md
git commit -m "$(cat <<'EOF'
chore: e2e smoke verification

Clean clone -> pnpm install -> pnpm setup --yes -> pnpm build -> pnpm doctor
all green against a synthetic OpenClaw home.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review checklist

After all tasks merge:

- [ ] `pnpm install && pnpm setup --yes && pnpm dev` works on a fresh clone.
- [ ] No `192.168.*`, `GalLe`, `OpenClaw-Bridge`, `openclaw2026`, `/opt/openclaw-manager` strings in source code (specs/plan/history excluded).
- [ ] Bridge boots without `HERMES_BASE_URL`.
- [ ] Bridge boots without `OPENCLAW_SDK_PATH` if a workspace `openclaw` package is installed (or with the env var as escape hatch).
- [ ] Dashboard reaches bridge only from server-side code; grep for `BRIDGE_TOKEN` in browser bundles returns no hits.
- [ ] PM2 `ecosystem.config.cjs` references `dist/server.js` and `next start`, both of which exist after `pnpm build`.
- [ ] README, INSTALL_README, SECURITY, CONTRIBUTING, LICENSE present at repo root.
- [ ] `engines.node >= 20.11.0` enforced via `package.json`.

---

## Smoke results (2026-05-10)

End-to-end verification on a fresh clone of branch `Gal/agent-model-fixes` (last commit `65a21af`) into a tmp dir, against a synthetic OpenClaw home (`$TMPDIR/fake-openclaw-*`), with `--bridge-port 3199` to dodge the host's running bridge on 3100.

- Fresh-clone install: PASS — `pnpm install` 4.5s, lockfile satisfied, no engines warning, no errors.
- `pnpm run bootstrap --yes --openclaw-home <fake> --bridge-port 3199`: PASS — wrote `apps/bridge/.env`, `apps/dashboard/.env.local`, `apps/bridge/config/runtimes.json`. Generated admin password matched `/^[a-z]+-[a-z]+-\d{2}$/`. Bootstrap token printed.
- Generated env contents: PASS — `BRIDGE_TOKEN` 64 hex; `AUTH_ASSERTION_SECRET` 64 hex and identical across both files; `BRIDGE_HOST=127.0.0.1`; `OPENCLAW_HOME` matches synthetic dir (forward-slash form); `OPENCLAW_GATEWAY_TOKEN=fake-gateway-token-for-smoke`; `HERMES_BASE_URL=` and `HERMES_TOKEN=` empty; `runtimes.json` contains exactly one entry (`oc-main`).
- Build (`pnpm -r build`): PASS — `apps/bridge/dist/server.js` and `apps/dashboard/.next` both produced.
- Doctor (bridge stopped): expected non-zero — Node OK, env files OK, Bridge `/health` ECONNREFUSED, Hermes skipped. (Gateway HTTP 200 because the host has a real OpenClaw running on 18789 — informational, not a failure of the smoke clone.)
- Doctor (bridge running on 3199): PASS — all six checks green; bridge booted cleanly with the standard `[openclaw] Resolved SDK from global npm install` transitional fallback message and listened on 127.0.0.1:3199 within 1s.
- Audit hits for `GalLe`, `192.168.0.`, `OpenClaw-Bridge`, `openclaw2026`, `/opt/openclaw-manager`, `Cursor projects`, `C:\Users\GalLe`, `C:\ProgramData\OpenClaw-Bridge`: none outside `docs/superpowers/specs/`, `docs/superpowers/plans/`, `docs/history/` (allowed).
- Issues fixed in this branch: none. No source/scripts/deploy/README rough edges surfaced; smoke clean on first try.
- Tester host: Windows 11 Pro, Node v24.14.1, pnpm 9.15.0.
- Caveats: `pnpm doctor` (without `run`) silently produced no output under the agent's Bash shell; `pnpm run doctor` works correctly. Not a real bug — pnpm script dispatch artifact in this shell. Documented INSTALL guides already use `pnpm doctor` directly which works in interactive shells.
