# Advanced: split-host topology

By default, bridge and dashboard run on the same machine and the bridge binds `127.0.0.1`. This page describes the split-host setup: bridge on the OpenClaw host, dashboard on a separate host.

## When this makes sense

- The Windows machine that runs OpenClaw is your daily-driver, and you want the dashboard up on a Linux server that's always reachable.
- You want one dashboard fronting multiple bridges (one per OpenClaw machine). Each bridge is a separate runtime entry in `apps/bridge/config/runtimes.json`.

## Topology

```
[Browser]
   │  http(s)://<dashboard-host>
   ▼
[Dashboard host]    Next.js + nginx
   │  http://<bridge-host>:3100   (LAN/VPN only)
   ▼
[Bridge host]       Express bridge on 0.0.0.0:3100
   │  ws://127.0.0.1:18789
   ▼
[OpenClaw Gateway]  loopback only
```

## Bridge host configuration

Edit `apps/bridge/.env` on the bridge host:

```
BRIDGE_HOST=0.0.0.0
BRIDGE_PORT=3100
BRIDGE_TOKEN=<32-byte hex, mirror to dashboard>
AUTH_ASSERTION_SECRET=<32-byte hex, mirror to dashboard>
```

Open the firewall to the dashboard host's IP only — never to `0.0.0.0/0`:

```bash
# Linux (firewalld)
sudo firewall-cmd --permanent --add-rich-rule="rule family=ipv4 source address=<dashboard-host-ip>/32 port port=3100 protocol=tcp accept"
sudo firewall-cmd --reload
```

```powershell
# Windows (PowerShell, admin)
New-NetFirewallRule -DisplayName "OpenClaw Manager bridge" `
  -Direction Inbound -Protocol TCP -LocalPort 3100 `
  -RemoteAddress <dashboard-host-ip> -Action Allow
```

Restart the bridge.

## Dashboard host configuration

Edit `apps/dashboard/.env.local` on the dashboard host:

```
OPENCLAW_BRIDGE_URL=http://<bridge-host>:3100
OPENCLAW_BRIDGE_TOKEN=<same value as BRIDGE_TOKEN on the bridge>
AUTH_ASSERTION_SECRET=<same value as on the bridge>
COOKIE_SECURE=false   # flip to true once TLS is in front of the dashboard
```

Restart the dashboard. Smoke-test from the dashboard host:

```bash
curl -sS --max-time 5 http://<bridge-host>:3100/health
# expected: {"ok":true,"uptime":...}
```

## Security caveats

> **Only run a split-host setup on a private network — LAN, VPN, or a dedicated cloud subnet.** The bridge does not do TLS, the bridge token is the only auth on the wire, and 3100 is unauthenticated to network scanners until the bearer check fires.

If you must expose the bridge across an untrusted network:

1. Put it behind a TLS-terminating reverse proxy (nginx with a server cert).
2. Add IP allow-listing at the proxy and at the OS firewall — both layers, not one.
3. Rotate `BRIDGE_TOKEN` after any incident or device loss.
4. Consider mTLS or a WireGuard tunnel between the two hosts instead of an exposed port.

The dashboard side has its own auth (login + cookie), but the bridge surface bypasses that — anything holding `BRIDGE_TOKEN` can talk to the bridge directly.

## See also

- [`../OPERATIONS.md`](../OPERATIONS.md) — health checks, secret rotation, common failure modes.
- [`../AUTH.md`](../AUTH.md) — auth model (session cookie, assertion exchange).
- [PM2](pm2.md) / [systemd](systemd.md) / [windows-service](windows-service.md) — how to keep both processes alive on their respective hosts.
