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

| Method | Path                    | Phase 1 behavior                                 |
|--------|-------------------------|--------------------------------------------------|
| GET    | `/v1/health`            | Liveness check; includes hermes version string   |
| GET    | `/v1/version`           | Shim version + hermes version                    |
| GET    | `/v1/capabilities`      | Supported / partial / unsupported feature matrix |
| GET    | `/v1/sessions`          | Stub: returns `[]`                               |
| GET    | `/v1/sessions/{id}`     | Stub: returns 404                                |
| GET    | `/v1/skills`            | Stub: returns `[]`                               |
| GET    | `/v1/activity`          | Stub: returns `[]` (accepts `since` + `limit`)   |

Query parameters for `/v1/activity`:

| Parameter | Type | Description                          |
|-----------|------|--------------------------------------|
| `since`   | int  | Reserved for Phase 2; currently ignored |
| `limit`   | int  | Reserved for Phase 2; currently ignored |

## Phase 1 vs Phase 2 — entity endpoints are stubbed

Live verification of the Hermes CLI on 2026-05-06 showed:

- No `--json` flag on `sessions list`, `skills list`, or `logs tail`.
- No `sessions show` subcommand at all (the available actions are `list`, `export`,
  `delete`, `prune`, `stats`, `rename`, `browse`).

Until the entity endpoints are reimplemented against native data sources
(`~/.hermes/sessions/*.json`, `hermes sessions export <out> --session-id <id>`,
`~/.hermes/state.db`, or `~/.hermes/logs/*.log`), the sessions / skills /
activity endpoints return empty results. The runtime adapter declares the
matching capabilities at the *contract* level (`sessions.list`, `sessions.read`,
`skills.list` supported; `logs.tail` partial) so a Phase-2 swap is a
shim-internal change with no contract break.

## References

- Spec: `docs/superpowers/specs/2026-05-04-hermes-runtime-integration-design.md`
- Plan: `docs/superpowers/plans/2026-05-04-hermes-runtime-integration.md`
