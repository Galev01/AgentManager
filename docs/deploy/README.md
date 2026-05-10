# Deployment

For local dev, just run `pnpm dev` from the repo root after `pnpm install && pnpm bootstrap`.

For long-running production-style installs, pick one:

- [PM2 (recommended)](pm2.md) — single recipe for Windows, macOS, and Linux.
- [systemd (Linux)](systemd.md) — for Linux servers where you already run other systemd units.
- [Windows Service via NSSM](windows-service.md) — for Windows machines where you want the bridge to survive logoff. Has caveats; see doc.
- [Reverse proxy with nginx](nginx.md) — front the dashboard with TLS or a friendly URL.
- [Advanced: split-host topology](advanced.md) — bridge and dashboard on different machines.

The bridge defaults to binding `127.0.0.1`. Anything beyond a single-host install needs explicit configuration; see [advanced.md](advanced.md).

For day-2 operational tasks (health checks, secret rotation, common failures), see [`../OPERATIONS.md`](../OPERATIONS.md).
