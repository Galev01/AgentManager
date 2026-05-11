#!/usr/bin/env bash
# Deploy bridge to gal@192.168.0.10
# Usage: bash scripts/deploy-bridge-remote.sh
set -e

REMOTE=gal@192.168.0.10
REMOTE_DIR=/home/gal/bridge

echo "==> Building bridge + workspace packages..."
pnpm --filter @openclaw-manager/types build
pnpm --filter @openclaw-manager/brain build
pnpm --filter bridge build

echo "==> Packaging dist..."
tar -czf /tmp/bridge-update.tar.gz \
  -C apps/bridge \
  --exclude='src' --exclude='test' --exclude='tsconfig.json' --exclude='.env' \
  dist config package.json

# Workspace packages
tar -czf /tmp/oc-packages.tar.gz \
  -C packages \
  types/dist types/package.json \
  brain/dist brain/package.json

echo "==> Uploading..."
scp /tmp/bridge-update.tar.gz /tmp/oc-packages.tar.gz "$REMOTE:/tmp/"

echo "==> Deploying on remote..."
ssh "$REMOTE" "
  set -e
  cd $REMOTE_DIR

  # Extract new dist + config
  tar -xzf /tmp/bridge-update.tar.gz

  # Update workspace packages (keep existing node_modules, just overwrite oc packages)
  tar -xzf /tmp/oc-packages.tar.gz -C node_modules/@openclaw-manager

  echo 'Restarting bridge service...'
  systemctl --user restart openclaw-bridge
  sleep 3
  systemctl --user status openclaw-bridge --no-pager | head -6
  curl -s http://localhost:3100/health
"

echo "==> Done."
