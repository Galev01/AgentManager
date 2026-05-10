# Security

## Threat model

OpenClaw-Manager is designed for **local, single-operator use**. The default install:

- Binds the bridge to `127.0.0.1`.
- Stores all secrets in local files (`apps/bridge/.env`, `apps/dashboard/.env.local`) gitignored from the repo.
- Authenticates dashboard users with a password + HMAC-signed cookie.
- Authenticates dashboard → bridge with a shared bearer token + HMAC-signed actor assertion.

There is no multi-tenant authorisation layer. Anyone who reaches the dashboard with valid credentials can drive every connected runtime as the operator account.

## What you control

| Surface | Default exposure | Auth |
|---------|------------------|------|
| Dashboard `:3000` | Bound to all interfaces by Next.js. **Restrict via firewall, reverse proxy, or VPN if multi-user.** | Password + signed session cookie |
| Bridge `:3100` | Loopback only (`BRIDGE_HOST=127.0.0.1`). | `BRIDGE_TOKEN` bearer + HMAC actor assertion |
| OpenClaw gateway `:18789` | Loopback only (OpenClaw's own choice). | `OPENCLAW_GATEWAY_TOKEN` |

If you set `BRIDGE_HOST=0.0.0.0` for a split-host install, **only do so on a private network**. The bridge token is the only auth on the bridge surface; if that token leaks and the bridge is internet-reachable, an attacker has full bridge access. Treat `BRIDGE_TOKEN` and `AUTH_ASSERTION_SECRET` like SSH host keys.

## Secrets

`pnpm bootstrap` generates:

| Secret | Size | Where it lives |
|--------|------|----------------|
| `BRIDGE_TOKEN` | 32-byte hex (64 chars) | `apps/bridge/.env`, mirrored in `apps/dashboard/.env.local` |
| `AUTH_ASSERTION_SECRET` | 32-byte hex (64 chars) | both env files; values must match |
| `AUTH_BOOTSTRAP_TOKEN` | 16-byte hex (32 chars), one-shot | `apps/bridge/.env` |
| `SESSION_SECRET` | 32-byte hex (64 chars) | `apps/dashboard/.env.local` |
| `ADMIN_PASSWORD` | readable phrase, printed once to stdout | hashed into the dashboard user store |
| `OPENCLAW_GATEWAY_TOKEN` | provided by OpenClaw | `apps/bridge/.env` |

These live in `.env` and `.env.local` files, both gitignored. **Never commit them.**

To rotate any secret:

1. Edit the relevant `.env` file. Mirror `BRIDGE_TOKEN` and `AUTH_ASSERTION_SECRET` to both the bridge env and the dashboard env — they must stay in sync.
2. Restart both processes (`pnpm dev` Ctrl-C and rerun, or `pm2 restart all`).

## Reporting vulnerabilities

Open a private security advisory on GitHub or email the maintainer. Do not file a public issue for security bugs.

## Hardening checklist

- [ ] TLS in front of the dashboard (nginx / caddy + Let's Encrypt). See [docs/deploy/nginx.md](docs/deploy/nginx.md).
- [ ] `COOKIE_SECURE=true` in `apps/dashboard/.env.local` once TLS is in place.
- [ ] Set up OIDC (`AUTH_OIDC_*` vars) and disable the legacy password path for multi-user installs.
- [ ] Restrict bridge port at the OS firewall to the dashboard host's IP for split-host setups.
- [ ] Rotate (or unset) `AUTH_BOOTSTRAP_TOKEN` after the first admin user is created. The endpoint is already one-shot, but unsetting the token removes the value from disk.
- [ ] Audit `apps/bridge/config/runtimes.json` before exposing the dashboard to a wider audience — every runtime listed is reachable by anyone who logs in.
