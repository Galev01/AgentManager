#!/usr/bin/env bash
# Deploy mcp-hermes to remote 192.168.0.10. Run from repo root.
set -euo pipefail

REMOTE_USER="${REMOTE_USER:-gal}"
REMOTE_HOST="${REMOTE_HOST:-192.168.0.10}"
REMOTE_LIB="\$HOME/.local/lib/mcp-hermes"
REMOTE_SYSTEMD="\$HOME/.config/systemd/user"
REMOTE_ENV_DIR="\$HOME/.mcp-hermes"

echo "==> Building locally"
pnpm --filter @openclaw-manager/mcp-hermes build

echo "==> Rsync dist + node_modules + package.json to remote"
rsync -az --delete \
  packages/mcp-hermes/dist/ \
  packages/mcp-hermes/package.json \
  packages/mcp-hermes/node_modules/ \
  "$REMOTE_USER@$REMOTE_HOST:$REMOTE_LIB/"

echo "==> Install systemd unit"
scp packages/mcp-hermes/systemd/mcp-hermes.service.template \
  "$REMOTE_USER@$REMOTE_HOST:$REMOTE_SYSTEMD/mcp-hermes.service"

echo "==> Reload + restart"
ssh "$REMOTE_USER@$REMOTE_HOST" '
  mkdir -p ~/.mcp-hermes ~/.config/systemd/user ~/.local/lib/mcp-hermes
  test -f ~/.mcp-hermes/env || { echo "create ~/.mcp-hermes/env first"; exit 1; }
  chmod 600 ~/.mcp-hermes/env
  systemctl --user daemon-reload
  systemctl --user enable --now mcp-hermes
  systemctl --user restart mcp-hermes
  systemctl --user status --no-pager mcp-hermes
'
