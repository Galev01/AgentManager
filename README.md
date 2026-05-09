# OpenClaw-Manager

A multi-runtime control plane and dashboard for collaborative AI agents. Run a local OpenClaw install, optionally talk to a remote Hermes runtime, manage conversations and runtime settings, and inspect activity — all from one operator UI.

## What it is

- **Bridge** (Express, port 3100): adapter layer between the dashboard and your AI runtimes. Talks to OpenClaw over its loopback WebSocket gateway, and optionally to a Hermes shim over HTTP.
- **Dashboard** (Next.js, port 3000): operator UI with password login. Server-side only — the browser never sees the bridge token.

## Quick start

```
pnpm install
pnpm bootstrap
pnpm dev
```

Then open `http://localhost:3000`.

The bootstrap wizard generates random secrets, picks free ports, discovers your OpenClaw install, and asks (once) whether you want a remote Hermes runtime. See [INSTALL_README.md](INSTALL_README.md) for the full walkthrough.

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

For systemd, Windows services, nginx reverse-proxy, or split-host topologies, see [docs/deploy/](docs/deploy/) and [docs/deploy/advanced.md](docs/deploy/advanced.md).

## Security

- Bridge binds `127.0.0.1` by default.
- Dashboard talks to bridge only from server code; `BRIDGE_TOKEN` never reaches the browser.
- All secrets are generated locally by `pnpm bootstrap`. No telemetry, no phone-home.
- See [SECURITY.md](SECURITY.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev loop, project layout, and PR conventions.

## License

MIT — see [LICENSE](LICENSE).
