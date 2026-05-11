# Operations Runbook

How to run, update, and verify a deployed OpenClaw Manager. The placeholders
`<dashboard-host>` and `<bridge-host>` refer to the two boxes you've installed
the dashboard and bridge on; replace with your own hostnames or IPs (or with
`127.0.0.1` for a single-host install). `<bridge-service>` is the NSSM service
name you registered on Windows (default: `openclaw-manager-bridge`). For full
topology and component overview see [AGENTS.md](../AGENTS.md).

## TL;DR topology

Production-style (recommended on Linux): nginx terminates HTTP(S) on the dashboard host and proxies to Next.js on **loopback** only:

```
Browser -> nginx (:80 / :443) -> Next.js 127.0.0.1:3000
(Next.js server) -> http://<bridge-host>:3100 -> OpenClaw Gateway 127.0.0.1:18789
```

See [docs/deploy/nginx.md](deploy/nginx.md) and [`docs/deploy/systemd/openclaw-dashboard.bind-loopback.conf`](deploy/systemd/openclaw-dashboard.bind-loopback.conf).

Direct access without nginx (quick / dev):

```
Browser -> Next.js (e.g. :3000)
(Next.js server) -> http://<bridge-host>:3100 -> OpenClaw Gateway 127.0.0.1:18789
```

Two moving pieces: the **dashboard** (Linux, always up) and the **bridge**
(Windows or Linux, always up as a service). Both must be running for the dashboard's
bridge-backed pages to load data.

---

## 1. Running the dashboard

The dashboard runs as a systemd unit on the dashboard host. It stays up on its
own — you only touch it when you want to start/stop/restart manually.

```bash
ssh root@<dashboard-host>
# inspect
systemctl status openclaw-dashboard
journalctl -u openclaw-dashboard -f          # live logs
# lifecycle
systemctl restart openclaw-dashboard
systemctl stop    openclaw-dashboard
systemctl start   openclaw-dashboard
```

**URL:** `http://<dashboard-host>` — login with your username + password (or OIDC, if configured). First run redirects to `/bootstrap`; see §4.3.

**Files on the server (paths are install-specific; the values below are the
defaults set up by the install script):**
- Working tree: `<install-prefix>/openclaw-manager` (owned by the service user)
- Env: `<install-prefix>/openclaw-manager/apps/dashboard/.env` (mode `0600`)
- Unit: `/etc/systemd/system/openclaw-dashboard.service`
- Reverse-proxy site config: e.g. `/etc/nginx/conf.d/openclaw-dashboard.conf`

---

## 2. Updating the dashboard (git pull)

If you cloned from a bare git remote on the server, you push to that remote and
pull from it on the server.

From your local repo (first time only):

```bash
git remote add server <user>@<dashboard-host>:<path-to-bare-repo>.git
```

### Full release flow

```bash
# 1. Local: commit + push
git checkout main
git pull --ff-only                             # if you work on a feature branch, merge first
git push server main

# 2. Server: pull, build, restart
ssh root@<dashboard-host> 'set -e; cd <install-prefix>/openclaw-manager && \
  sudo -u openclaw git pull --ff-only && \
  sudo -u openclaw pnpm install --frozen-lockfile && \
  sudo -u openclaw pnpm --filter dashboard build && \
  systemctl restart openclaw-dashboard'
```

Skip `pnpm install` when no dependencies changed. Skip `pnpm build` when only non-dashboard files changed.

### Rolling back

```bash
ssh root@<dashboard-host> 'cd <install-prefix>/openclaw-manager && sudo -u openclaw git log --oneline -10'
ssh root@<dashboard-host> 'cd <install-prefix>/openclaw-manager && sudo -u openclaw git reset --hard <commit> && \
  sudo -u openclaw pnpm --filter dashboard build && systemctl restart openclaw-dashboard'
```

---

## 3. Updating the bridge (Windows side)

The bridge runs as a Windows service `<bridge-service>` (NSSM, LocalSystem,
auto-start). Any change under `apps/bridge/` or `packages/*` that the bridge
imports needs a rebuild + service restart. The deploy scripts under
`docs/deploy/windows-service/scripts/` install and restart the service.

```powershell
# In an admin PowerShell, from the repo root:
pnpm --filter bridge build
.\docs\deploy\windows-service\scripts\restart-bridge-service.ps1
```

Or manually in an admin shell:

```powershell
nssm restart <bridge-service>
Get-Content "$env:ProgramData\<bridge-service>\logs\bridge.out.log" -Tail 20
```

The bridge starts automatically on Windows boot — you don't need to launch
anything after reboot. (OpenClaw Gateway itself only starts when the gateway
user signs in, so the bridge will log SDK errors until that happens.)

---

## 4. Health checks — is everything working?

Run these in order. The first failure tells you which layer is down.

### 4.1 From anywhere on the LAN

```bash
# reverse proxy up, dashboard responds, anonymous redirects to /login
curl -sI http://<dashboard-host>/
# expected: HTTP/1.1 307 ... location: http://<dashboard-host>/login
```

### 4.2 From the dashboard server

```bash
ssh root@<dashboard-host>

# dashboard process healthy
systemctl is-active openclaw-dashboard          # active
ss -lntp | grep :3000                           # 127.0.0.1:3000 LISTEN

# bridge reachable over LAN
curl -sS --max-time 5 http://<bridge-host>:3100/health
# expected: {"ok":true,"uptime":...}
```

### 4.3 End-to-end through the dashboard

**First-run (no users yet):** the dashboard redirects anonymous requests to `/bootstrap`. The operator supplies `AUTH_BOOTSTRAP_TOKEN` + a chosen username + password to create the first admin. The token is single-use and should be removed from the env after the first admin exists.

**Returning users:** `/login` accepts a username + password form, or (if `AUTH_OIDC_*` is configured) an OIDC button that delegates to the upstream IdP.

Sessions are opaque, server-side, and tracked by the bridge. The browser only sees an `ocm_sid` cookie (32-byte base64url, no HMAC payload).

```bash
# Login and grab the session cookie
COOKIE=$(curl -sS -i -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"<USERNAME>","password":"<PASSWORD>"}' \
  http://<dashboard-host>/api/auth/login \
  | grep -i set-cookie | sed 's/.*ocm_sid=\([^;]*\).*/\1/')

# Bridge is reachable through the dashboard proxy
curl -sS -H "Cookie: ocm_sid=$COOKIE" http://<dashboard-host>/api/gateway-status
# expected: {"status":"online"}   (says "offline" if bridge can't reach OpenClaw Gateway)

# Authed home page
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Cookie: ocm_sid=$COOKIE" http://<dashboard-host>/
# expected: 200
```

### 4.4 Windows bridge (only if something upstream looks wrong)

```powershell
Get-Service <bridge-service>                    # Status: Running
Get-NetTCPConnection -LocalPort 3100 -State Listen | Select LocalAddress, OwningProcess
Get-Content "$env:ProgramData\<bridge-service>\logs\bridge.out.log" -Tail 20
Get-Content "$env:ProgramData\<bridge-service>\logs\bridge.err.log" -Tail 20
```

Look for these lines in `bridge.out.log` to confirm a healthy boot:
- `Bridge listening on 0.0.0.0:3100`
- `OpenClaw SDK loaded for gateway calls`
- `Brain: watching vault at <BRAIN_VAULT_PATH>`

---

## 5. Common failure modes

| Symptom | Where to look | Typical cause |
|---|---|---|
| `HTTP 502` from reverse proxy | `journalctl -u openclaw-dashboard -n 50` | Next.js crashed — check for build/runtime errors |
| Login loop in browser (cookie never sticks) | `<install-prefix>/openclaw-manager/apps/dashboard/.env` | `COOKIE_SECURE=true` on a plain-HTTP origin. Must be `false` for plain-HTTP LAN. |
| Gateway status `offline` despite bridge running | `$env:ProgramData\<bridge-service>\logs\bridge.out.log` | OpenClaw isn't running (gateway user not signed in), or `OPENCLAW_SDK_PATH` in `apps/bridge/.env` points at a stale hashed filename after an SDK upgrade |
| Dashboard can't reach bridge (`/api/gateway-status` hangs) | `curl http://<bridge-host>:3100/health` from server | Windows Firewall rule for the bridge port missing, or bridge service stopped |
| After git pull, new page returns 404 | `ls apps/dashboard/.next` timestamp | Forgot to rebuild — re-run `pnpm --filter dashboard build` and restart |
| After reboot, nothing works until you log in | Expected | OpenClaw Gateway is user-scoped; sign in and give it a few seconds |

---

## 6. Secrets & env

The dashboard `.env` on the server holds the auth + bridge secrets:

```
AUTH_ASSERTION_SECRET=...            # >=32 random chars; MUST match the bridge's value
AUTH_BOOTSTRAP_TOKEN=...             # one-shot, used at /bootstrap for first admin; remove after
# Optional OIDC (set all four to enable the SSO button on /login)
AUTH_OIDC_ISSUER=...
AUTH_OIDC_CLIENT_ID=...
AUTH_OIDC_CLIENT_SECRET=...
AUTH_OIDC_REDIRECT_URI=...
SESSION_SECRET=...
OPENCLAW_BRIDGE_URL=http://<bridge-host>:3100
OPENCLAW_BRIDGE_TOKEN=...            # must match BRIDGE_TOKEN in the bridge's .env
COOKIE_SECURE=false                  # required for plain-HTTP LAN deploy
NODE_ENV=production
PORT=3000
HOSTNAME=127.0.0.1
```

- **`AUTH_ASSERTION_SECRET`** — signs the short-lived assertions the dashboard presents to the bridge on every proxied call. Must be byte-identical on both sides. Rotate by generating a new value, deploying it to the bridge and dashboard in lockstep, then restarting both services; existing sessions are invalidated.
- **`AUTH_BOOTSTRAP_TOKEN`** — single-use secret the operator types into `/bootstrap` to mint the first admin. Remove it from both envs after that admin exists; keeping it around is a standing footgun.
- **`AUTH_OIDC_*`** — optional. If all four are set, `/login` shows the SSO button and accepts IdP callbacks; unset to disable.

See [`docs/AUTH.md`](AUTH.md) for the authoritative auth model (session cookie, assertion exchange, user store, OIDC flow).

To rotate `BRIDGE_TOKEN`: update both `apps/bridge/.env` on Windows (then
`nssm restart <bridge-service>`) **and**
`<install-prefix>/openclaw-manager/apps/dashboard/.env` on the server (then
`systemctl restart openclaw-dashboard`). They must stay in sync.
