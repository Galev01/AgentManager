# Windows Service (NSSM)

NSSM wraps the bridge as a Windows Service so it survives logoff and reboots without anybody being signed in.

> Prefer [PM2](pm2.md) unless you specifically need a Windows Service. PM2 is simpler, runs as the user, and avoids the LocalSystem caveats below.

## When to use this recipe

- The bridge host is a Windows machine that should run unattended.
- You want the bridge up before any user logs in.
- You're OK with the LocalSystem caveats below, or you'll register the service under a real user account.

## Prerequisites

- [NSSM](https://nssm.cc/) on `PATH` (`nssm.exe`).
- The bridge already built: `pnpm install && pnpm bootstrap && pnpm --filter bridge build`.
- An admin PowerShell.

## Install

The repo ships PowerShell helpers under `docs/deploy/windows-service/scripts/`. From an **elevated** PowerShell, in the repo root:

```powershell
.\docs\deploy\windows-service\scripts\install-bridge-service.ps1
```

This registers a service (default name: `openclaw-manager-bridge`), points it at `apps/bridge/dist/server.js`, and writes logs under `$env:ProgramData\<service-name>\logs\`.

To restart after an update:

```powershell
pnpm --filter bridge build
.\docs\deploy\windows-service\scripts\restart-bridge-service.ps1
```

Or by hand:

```powershell
nssm restart openclaw-manager-bridge
Get-Content "$env:ProgramData\openclaw-manager-bridge\logs\bridge.out.log" -Tail 20
```

## Caveats — LocalSystem and `~/.openclaw`

NSSM defaults to running services as `LocalSystem`. That account has no real home directory, so `~/.openclaw` resolves to a profile that does not contain your OpenClaw install. **The bridge will fail to find OpenClaw** unless you do one of:

### Option 1 (recommended): run as a real user

In the NSSM service config (`nssm edit openclaw-manager-bridge`) → **Log on** tab, set `This account` to the Windows user that runs OpenClaw (e.g. `.\<username>`), with that user's password. The service will then have a real home, and `~/.openclaw` resolves correctly.

### Option 2: override paths explicitly

Keep LocalSystem (or any account), but force the bridge to look in the right place. Edit `apps/bridge/.env`:

```
OPENCLAW_HOME=C:\Users\<openclaw-user>\.openclaw
OPENCLAW_SDK_PATH=C:\Users\<openclaw-user>\.openclaw\sdk\dist\call-XXXXXXXX.js
```

(The hashed `call-*.js` filename changes when OpenClaw upgrades. Re-pin after each upgrade.)

## Dashboard on Windows

The dashboard normally runs on Linux behind nginx. If you want it on Windows too, register a second NSSM service with `Application: node`, `Arguments: node_modules\next\dist\bin\next start -H 127.0.0.1 -p 3000`, `Startup directory: <repo>\apps\dashboard`. Or just use [PM2](pm2.md), which handles both at once.

## Health checks and operational notes

For health checks, log paths, and update procedures (`nssm restart`, etc.) see [`../OPERATIONS.md`](../OPERATIONS.md) §3 and §4.4.

## Scripts referenced

- `docs/deploy/windows-service/scripts/install-bridge-service.ps1` — registers the service.
- `docs/deploy/windows-service/scripts/restart-bridge-service.ps1` — rebuild-and-restart helper.
- `docs/deploy/windows-service/scripts/restart-openclaw-stack.ps1` — restart bridge + OpenClaw together.
- `docs/deploy/windows-service/scripts/run-elevated.ps1`, `run-elevated-restart.ps1` — relaunch helpers for elevation.
