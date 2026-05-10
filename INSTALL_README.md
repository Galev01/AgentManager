# OpenClaw-Manager — Install Guide

This guide walks you from a fresh clone to a working dashboard. It assumes you already have a running OpenClaw install on the same machine.

## 1. Prerequisites

- **Node.js 20.11 or newer.** Check: `node -v`. Install via [nvm](https://github.com/nvm-sh/nvm) on Mac/Linux or [nvm-windows](https://github.com/coreybutler/nvm-windows) on Windows.
- **pnpm 9 or newer.** Check: `pnpm -v`. Install: `npm i -g pnpm`.
- **A running OpenClaw install.** The bridge connects to OpenClaw's loopback gateway and reads plugin state from disk. If you don't have one yet, set that up first.

## 2. Clone and install

```
git clone <your fork or upstream> openclaw-manager
cd openclaw-manager
pnpm install
```

`pnpm install` enforces the engines and `packageManager` pin in the root `package.json`. If you see a Node-version warning, upgrade Node before continuing.

## 3. Run the bootstrap wizard

```
pnpm bootstrap
```

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

```
pnpm bootstrap --yes
```

Other flags:

```
--bridge-port 3100
--dashboard-port 3000
--openclaw-home /custom/path/.openclaw
--reset-admin-password
--reset-runtimes
```

`--reset-admin-password` regenerates the admin phrase even if `apps/dashboard/.env.local` already has one. `--reset-runtimes` rewrites `apps/bridge/config/runtimes.json` from scratch (handy if you want to add or remove Hermes after the first run).

> Note: the npm script alias is `bootstrap` because pnpm reserves `setup` for its own CLI. The underlying script file is still `scripts/setup.ts`.

## 4. Start the apps

```
pnpm dev
```

This runs the bridge and dashboard concurrently. Logs are colour-tagged.

In a separate terminal:

```
pnpm doctor
```

This checks that env files exist and parse, the bridge `/health` endpoint responds, and the OpenClaw gateway is reachable. The OpenClaw and Hermes checks are informational — if your gateway isn't running yet, the bridge will still boot and the dashboard will show OpenClaw as disconnected.

## 5. Bootstrap the admin user

Open `http://localhost:3000/bootstrap`.

Paste the bootstrap token printed by `pnpm bootstrap`. Set a username and password. Submit.

The bootstrap endpoint is one-shot: after the first user exists, it returns 403. The token is also rejected after first use, so you cannot accidentally create a second admin with the same token.

Log in at `http://localhost:3000` with the credentials you just set.

## 6. Connect to OpenClaw

The dashboard's runtimes view should show `OpenClaw (local)` as connected. If it shows disconnected:

- Check that OpenClaw is actually running.
- Run `pnpm doctor` and read the report.
- Tail `apps/bridge` logs for `ECONNREFUSED 127.0.0.1:18789`.
- Verify the gateway token: open `~/.openclaw/openclaw.json` and check `gateway.token`. It must match `OPENCLAW_GATEWAY_TOKEN` in `apps/bridge/.env`.

## 7. (Optional) Connect to Hermes

If you said "no" to Hermes during bootstrap and want to add it later, you have two options.

**Option A — rerun the wizard:**

```
pnpm bootstrap --reset-runtimes
```

Answer "yes" when asked about Hermes; supply the base URL and bearer token. Existing secrets and the admin password are preserved.

**Option B — edit by hand:**

1. Edit `apps/bridge/.env`:
   ```
   HERMES_BASE_URL=http://your-hermes-host:9119
   HERMES_TOKEN=<bearer token>
   ```
2. Edit `apps/bridge/config/runtimes.json` to add a Hermes entry alongside OpenClaw.
3. Restart the bridge: `pnpm --filter bridge dev` (or `pm2 restart openclaw-manager-bridge` in production).

## 8. Production install

For long-running installs that survive reboots, use PM2:

```
npm i -g pm2
pnpm build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Run that last `pm2 startup` command's printed instruction, then `pm2 save` once more. Reboot to verify.

For systemd, Windows services (NSSM), nginx reverse-proxy, or split-host topologies, see [docs/deploy/](docs/deploy/).

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `Bridge configuration incomplete. Missing or invalid: ...` | Run `pnpm bootstrap`. Or copy `apps/bridge/.env.example` → `apps/bridge/.env` and fill in. |
| `Could not resolve OpenClaw SDK` | Either install OpenClaw inside the workspace (`pnpm --filter bridge add openclaw`), or set `OPENCLAW_SDK_PATH=/abs/path/to/dist/call-*.js` in `apps/bridge/.env`. |
| `AUTH_ASSERTION_SECRET must be set and >= 32 chars` | The bridge enforces this. Rerun `pnpm bootstrap` to regenerate, or paste a 32+ char random hex into both `apps/bridge/.env` and `apps/dashboard/.env.local` — the two values must match. |
| Dashboard shows OpenClaw disconnected | OpenClaw isn't running, or the gateway token doesn't match. See §6. |
| Port 3000 or 3100 already in use | Pass `--bridge-port` / `--dashboard-port` to `pnpm bootstrap`, or stop the conflicting process. |
| Windows: backslashes in `.env` look wrong | The wizard writes forward-slash paths on Windows for parser safety. They work fine. |
| Windows service version: bridge runs as LocalSystem and can't find `~/.openclaw` | Run the bridge under a real user account, not LocalSystem. See [docs/deploy/windows-service.md](docs/deploy/windows-service.md). |

## Updating

```
git pull
pnpm install
pnpm build
```

If the upgrade changes config schema, rerun `pnpm bootstrap`. Existing `.env` values you want to keep can be pasted back in; the wizard prompts before overwriting.
