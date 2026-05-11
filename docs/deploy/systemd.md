# systemd (Linux)

If you prefer systemd over PM2 directly, you have two reasonable shapes.

## Option A: single unit, pm2-runtime supervises the pair (recommended)

`pm2-runtime` is a foreground variant of PM2 designed for container/service supervisors. systemd is the supervisor; PM2 inside it manages both apps as one process tree.

`/etc/systemd/system/openclaw-manager.service`:

```ini
[Unit]
Description=OpenClaw-Manager (bridge + dashboard via PM2)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=openclaw
WorkingDirectory=<install-prefix>/openclaw-manager
EnvironmentFile=<install-prefix>/openclaw-manager/apps/bridge/.env
EnvironmentFile=<install-prefix>/openclaw-manager/apps/dashboard/.env.local
ExecStart=/usr/bin/npx pm2-runtime start ecosystem.config.cjs
Restart=on-failure
RestartSec=5
KillMode=mixed
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
```

Notes:

- Replace `<install-prefix>` with the absolute path you installed the repo at (e.g. `/opt`).
- `User=openclaw` must be the same OS user that owns `~/.openclaw` and runs the OpenClaw gateway. If OpenClaw runs as a different user, the bridge cannot reach the loopback gateway from a different session.
- `pm2-runtime` ships with the `pm2` npm package. If you used `npm i -g pm2`, the binary is on `PATH` as `pm2-runtime`; adjust `ExecStart` accordingly (`/usr/local/bin/pm2-runtime` is common).
- `EnvironmentFile=` is optional — both apps already read their own `.env` / `.env.local` at boot. Listing them here is convenient for `systemctl show` / debugging.

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now openclaw-manager
sudo systemctl status openclaw-manager
sudo journalctl -u openclaw-manager -f
```

## Option B: split units, no PM2

One systemd unit per app, no PM2 in the picture. Simpler if you don't want a second supervisor.

`/etc/systemd/system/openclaw-manager-bridge.service`:

```ini
[Unit]
Description=OpenClaw-Manager bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=openclaw
WorkingDirectory=<install-prefix>/openclaw-manager/apps/bridge
EnvironmentFile=<install-prefix>/openclaw-manager/apps/bridge/.env
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/openclaw-manager-dashboard.service`:

```ini
[Unit]
Description=OpenClaw-Manager dashboard
After=network-online.target openclaw-manager-bridge.service
Wants=network-online.target

[Service]
Type=simple
User=openclaw
WorkingDirectory=<install-prefix>/openclaw-manager/apps/dashboard
EnvironmentFile=<install-prefix>/openclaw-manager/apps/dashboard/.env.local
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable both:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now openclaw-manager-bridge
sudo systemctl enable --now openclaw-manager-dashboard
```

## Which to pick

- **Option A** (pm2-runtime) gives you `pm2 logs` / `pm2 status` ergonomics during debugging, and matches the local dev shape.
- **Option B** (split units) gives you per-app `systemctl restart` and slightly cleaner dependency ordering.

Either works. Don't mix — running PM2 *and* both systemd units leads to two supervisors fighting over the same processes.

## Updates

Same as PM2 — `git pull && pnpm install && pnpm build`, then either `systemctl restart openclaw-manager` (Option A) or restart both split units.

## See also

- [PM2 recipe](pm2.md) — same idea, no systemd.
- [nginx reverse proxy](nginx.md) — TLS/friendly URLs in front of the dashboard.
- [`openclaw-dashboard.bind-loopback.conf`](systemd/openclaw-dashboard.bind-loopback.conf) — systemd drop-in when using nginx (Next standalone listens on `127.0.0.1:3000`).
