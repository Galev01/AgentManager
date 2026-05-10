# PM2

PM2 is the recommended process manager for OpenClaw-Manager because it works the same way on Windows, macOS, and Linux, and the repo ships an `ecosystem.config.cjs` that supervises both apps.

## Install PM2

```
npm i -g pm2
```

## First run

From the repo root:

```
pnpm install
pnpm bootstrap
pnpm build
pm2 start ecosystem.config.cjs
```

PM2 will start two processes:

- `openclaw-manager-bridge` — Express bridge on port `3100` by default.
- `openclaw-manager-dashboard` — Next.js dashboard on port `3000` by default, bound to `127.0.0.1`.

Inspect them:

```
pm2 status
pm2 logs --lines 200
```

The repo also exposes thin npm wrappers if you prefer them:

```
pnpm pm2:start
pnpm pm2:restart
pnpm pm2:stop
pnpm pm2:logs
```

## Persist across reboots

```
pm2 save
pm2 startup
```

`pm2 startup` prints an OS-specific command (a systemd `enable` line on Linux, a `Set-Service` line on Windows). Run that command, then `pm2 save` once more so the saved dump matches the now-registered boot unit. Reboot to verify.

## Updates

```
git pull
pnpm install
pnpm build
pm2 restart ecosystem.config.cjs
```

If `pnpm bootstrap` introduced new env keys (rare), rerun it before `pm2 restart`.

## Run as a specific OS user

The bridge **must** run as the same OS user that runs your OpenClaw install. The OpenClaw loopback gateway is bound to that user's session, and the default `OPENCLAW_HOME` (`~/.openclaw`) resolves to that user's home directory.

If you want PM2 to run as a non-root system user on Linux/macOS, install and configure PM2 under that user's account — `sudo -iu <user>` first, then `npm i -g pm2`, then `pm2 start ...`. Do not run PM2 as root for OpenClaw-Manager unless OpenClaw itself runs as root.

On Windows, install Node and PM2 inside the target user's profile (or use `pm2-windows-service` under that user) rather than under `LOCAL SYSTEM`. The Windows Service / NSSM recipe at [windows-service.md](windows-service.md) explains the same caveat for the bridge.

## Override ports or env

PM2 reads `apps/bridge/.env` and `apps/dashboard/.env.local` at process boot — same as `pnpm dev`. Edit those files (or rerun `pnpm bootstrap`) and `pm2 restart ecosystem.config.cjs` to pick up changes. The dashboard port in `ecosystem.config.cjs` is wired via the CLI arg `start -H 127.0.0.1 -p 3000`; change that string and restart if you need a different port.
