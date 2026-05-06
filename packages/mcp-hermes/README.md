# mcp-hermes

Remote-hosted Model Context Protocol (MCP) facade for the Hermes agent. Exposes
`hermes_say`, `hermes_session_info`, and `hermes_conclude` to Claude Code over
Streamable HTTP, forwarding chat turns to a local `hermes-shim` process.

## Architecture

```
Claude Code ── HTTP+bearer ──► mcp-hermes (192.168.0.10:9120)
                                  │
                                  └─ HTTP+bearer ──► hermes-shim (127.0.0.1:9119)
                                                          │
                                                          └─ subprocess ──► hermes -z
```

## Phase-1 limits

- Sessions are in-process only; lost on restart.
- No operator moderation, no dashboard, no manual-mode flip.
- See `docs/superpowers/specs/2026-05-06-consult-hermes-design.md`.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `MCP_HERMES_TOKEN` | (required) | Bearer that Claude Code presents to MCP |
| `HERMES_SHIM_TOKEN` | (required) | Bearer that MCP presents to hermes-shim |
| `HERMES_SHIM_URL` | `http://127.0.0.1:9119` | Local shim base URL |
| `MCP_HERMES_HOST` | `127.0.0.1` | Bind host |
| `MCP_HERMES_PORT` | `9120` | Bind port |
| `MCP_HERMES_BIND_LAN` | (unset) | Set to `1` to allow non-loopback bind |

## Deployment to 192.168.0.10

See `scripts/deploy-remote.sh`.

## Register in Claude Code

```
claude mcp add --transport http --scope user hermes \
  http://192.168.0.10:9120/mcp \
  --header "Authorization: Bearer <MCP_HERMES_TOKEN>"
```
