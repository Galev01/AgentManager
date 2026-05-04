# hermes-shim

HTTP+bearer shim that wraps a curated subset of the `hermes` CLI for OpenClaw-Manager.

## Why this exists

The Hermes web UI is loopback-only and uses ephemeral session-token auth designed for
browser interaction. This shim provides a stable bearer-auth contract for
service-to-service use: one token, one port, predictable JSON responses.

## Requirements

Python 3.11+. Install dependencies from `pyproject.toml`:

```
pip install -e packages/hermes-shim
```

Or copy the package to the remote host and install from local path:

```
pip install -e /path/to/hermes-shim
```

## Running

```
HERMES_SHIM_TOKEN=<secret> hermes-shim
```

Defaults to `127.0.0.1:9119`. Override with env vars:

| Variable               | Default       | Description                             |
|------------------------|---------------|-----------------------------------------|
| `HERMES_SHIM_TOKEN`    | (required)    | Bearer token clients must present       |
| `HERMES_SHIM_HOST`     | `127.0.0.1`   | Bind address                            |
| `HERMES_SHIM_PORT`     | `9119`        | Bind port                               |
| `HERMES_SHIM_BIND_LAN` | (unset)       | Set to `1` to allow non-loopback bind   |

## Network exposure

The default is loopback only (`127.0.0.1`). The shim enforces this at startup:
if `HERMES_SHIM_HOST` is anything other than `127.0.0.1` and
`HERMES_SHIM_BIND_LAN` is not `1`, the process exits with code 2.

**Recommended deployment**: use an SSH local forward from the bridge host rather
than opening a LAN port:

```
bridge-host$ ssh -L 19119:127.0.0.1:9119 gal@192.168.0.10
```

The bridge runtime descriptor's `endpoint` then points at:

```
http://127.0.0.1:19119
```

No firewall changes needed on either host.

## systemd (user service)

A template is at `systemd/hermes-shim.service.template`. Install:

```
cp systemd/hermes-shim.service.template ~/.config/systemd/user/hermes-shim.service
systemctl --user daemon-reload
systemctl --user enable --now hermes-shim
```

Create `~/.hermes/shim.env` (readable only by your user) containing at minimum:

```
HERMES_SHIM_TOKEN=...
HERMES_SHIM_HOST=127.0.0.1
HERMES_SHIM_PORT=9119
```

```
chmod 600 ~/.hermes/shim.env
```

## API surface

All endpoints require `Authorization: Bearer <HERMES_SHIM_TOKEN>`.

| Method | Path                    | Description                                      |
|--------|-------------------------|--------------------------------------------------|
| GET    | `/v1/health`            | Liveness check; includes hermes version string   |
| GET    | `/v1/version`           | Shim version + hermes version                    |
| GET    | `/v1/capabilities`      | Supported / partial / unsupported feature matrix |
| GET    | `/v1/sessions`          | List all sessions (`hermes sessions list --json`) |
| GET    | `/v1/sessions/{id}`     | Session detail + transcript (`hermes sessions show {id} --json`) |
| GET    | `/v1/skills`            | Installed skills (`hermes skills list --json`)   |
| GET    | `/v1/activity`          | Recent activity log (`hermes logs tail --json [--since N] [--limit N]`) |

Query parameters for `/v1/activity`:

| Parameter | Type | Description                          |
|-----------|------|--------------------------------------|
| `since`   | int  | Return events after this timestamp   |
| `limit`   | int  | Maximum number of events to return   |

## Hermes CLI flag verification

The CLI flags used by this shim (`sessions list --json`, `sessions show <id> --json`,
`skills list --json`, `logs tail --json --since <n> --limit <n>`) are derived from
the integration spec and **have not been validated against the live `hermes` binary**.
Before deploying to the remote host, run `hermes sessions --help`, `hermes skills --help`,
and `hermes logs tail --help` to confirm flag names — for example `--json` may be
`--format=json`, and `--since` may be `--since-ms`.

## References

- Spec: `docs/superpowers/specs/2026-05-04-hermes-runtime-integration-design.md`
- Plan: `docs/superpowers/plans/2026-05-04-hermes-runtime-integration.md`
