# Contributing

Thanks for your interest in OpenClaw-Manager. This document covers the dev loop, project layout, and the conventions we use for branches and PRs.

## Dev loop

```
pnpm install
pnpm bootstrap
pnpm dev
```

`pnpm dev` runs the bridge and dashboard concurrently with colour-tagged logs. Hit Ctrl-C to stop both.

Quick health check while developing:

```
pnpm doctor
```

## Tests

```
pnpm --filter bridge test
pnpm --filter dashboard test
```

Bridge uses `node:test`. Dashboard uses Vitest.

Run everything:

```
pnpm -r test
```

## Project layout

```
apps/
  bridge/        Express HTTP bridge (port 3100)
  dashboard/     Next.js operator UI (port 3000)
packages/
  types/         Shared TypeScript contracts
  brain/         Knowledge vault layer
  mcp-openclaw/  MCP facade for OpenClaw
  mcp-hermes/    MCP facade for Hermes
  hermes-shim/   Optional remote-Hermes adapter
scripts/
  setup.ts       pnpm bootstrap wizard
  doctor.ts      pnpm doctor health check
docs/
  deploy/        Production deployment recipes
  history/       Archived design docs
  superpowers/   Specs and implementation plans
```

## Style

- TypeScript strict.
- Prefer small focused files over large multi-purpose ones.
- Tests for any new module touching config, secrets, or runtime registry.
- No emojis in source, code comments, or commit messages unless explicitly requested.
- Commits: short imperative subject, body explains why.

## Branches and PRs

- Feature branches: `<your-name>/<feature>` (e.g. `Gal/agent-model-fixes`).
- Open PRs against `main`. Squash-merge.
- `main` is protected: PRs require at least one approval before merge.

## License

By contributing you agree your code is licensed under the project's MIT license. See [LICENSE](LICENSE).
