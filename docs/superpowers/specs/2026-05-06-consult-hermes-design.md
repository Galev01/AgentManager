# Consult-Hermes Design Spec

**Date:** 2026-05-06
**Status:** Phase 1 implemented

## Goal

Provide a `/consult-hermes` Claude Code skill analogous to `/consult-openclaw`, routing collaborative turns to the Hermes agent via a remote MCP service.

## Architecture

New Node package `packages/mcp-hermes/` runs as a sibling process to `hermes-shim` on `192.168.0.10`. Exposes MCP over Streamable HTTP transport on port `9120` with bearer auth (`MCP_HERMES_TOKEN`). Forwards each `hermes_say` to `hermes-shim` `POST /v1/chat` (loopback `127.0.0.1:9119`) using a server-held shim token (`HERMES_SHIM_TOKEN`). Maintains in-process session map keyed by clientId. Claude Code registers it as a remote HTTP MCP. Skill mirrors consult-openclaw structure but instructs Claude Code to feed Hermes full project context per turn, since Hermes has no embedded knowledge of the OpenClaw-manager codebase.

```
Claude Code ── HTTP+bearer (MCP_HERMES_TOKEN) ──► mcp-hermes :9120
                                                       │
                                                       └─ HTTP+bearer (HERMES_SHIM_TOKEN) ──► hermes-shim :9119
                                                                                                    │
                                                                                                    └─ hermes -z (subprocess)
```

## File Structure

```
packages/mcp-hermes/
├── src/
│   ├── server.ts              # Express + StreamableHTTP transport bootstrap
│   ├── auth.ts                # Bearer middleware
│   ├── sessions.ts            # In-process session map
│   ├── shim-client.ts         # POST /v1/chat wrapper
│   └── tools.ts               # hermes_say, hermes_session_info, hermes_conclude handlers
├── test/                      # Vitest unit tests (25 tests)
├── systemd/mcp-hermes.service.template
├── scripts/deploy-remote.sh
├── README.md
├── package.json
└── tsconfig.json

~/.claude/skills/consult-hermes/SKILL.md   # Lives outside repo on Gal's local machine
```

## Lossy parity vs consult-openclaw

| Capability | OpenClaw | Hermes phase 1 |
|---|---|---|
| say/turn | envelope (intent/state/artifact/refs) | message + session_id only |
| conclude | DB session ended, dashboard archive | in-memory flag |
| session_info | id/displayName/mode/messageCount from DB | id/messageCount/status from in-mem |
| manual mode flip | yes | no |
| discard reply | yes | no |
| dashboard visibility | yes | no |
| persistence across restart | yes | no |

## Trust boundaries

- Client → MCP: `MCP_HERMES_TOKEN`, distinct from shim token.
- MCP → shim: `HERMES_SHIM_TOKEN`, server-side only, never returned to client.
- Token rotation: edit `/home/gal/.mcp-hermes/env`, `systemctl --user restart mcp-hermes`.

## Future-reuse (NOT phase 1)

- Durable session DB (could add SQLite under `/home/gal/.mcp-hermes/sessions.db`).
- Operator moderation UI (would require new endpoints + dashboard work mirroring OpenClaw's `/claude-code/sessions` PATCH).
- Envelope (intent/state/artifact/refs) — requires shim-side metadata persistence first.

## References

- Plan: `docs/superpowers/plans/2026-05-06-consult-hermes-mcp.md`
- Hermes runtime spec: `docs/superpowers/specs/2026-05-04-hermes-runtime-integration-design.md`
- mcp-hermes README: `packages/mcp-hermes/README.md`
- Skill source: `~/.claude/skills/consult-hermes/SKILL.md`
