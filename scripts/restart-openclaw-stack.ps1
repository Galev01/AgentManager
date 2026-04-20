#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Restart the full OpenClaw stack on Windows: gateway + bridge.

.DESCRIPTION
  1. Kills the running OpenClaw gateway node process (matched by command line
     containing 'openclaw' and 'gateway' and port 18789).
  2. Relaunches it via the user's C:\Users\GalLe\.openclaw\gateway.cmd.
  3. Restarts the NSSM-managed OpenClaw-Bridge service.
  4. Prints health checks.

  Must be run elevated so the bridge service can be restarted.

.NOTES
  Gateway is user-space, bridge is a LocalSystem service. Admin is required
  for the bridge restart; gateway restart also works under admin because
  Start-Process inherits the elevated session but spawns a detached process.
#>

$ErrorActionPreference = 'Continue'

$GatewayCmd      = 'C:\Users\GalLe\.openclaw\gateway.cmd'
$GatewayPattern  = '*openclaw*gateway*18789*'
$GatewayPort     = 18789
$BridgeService   = 'OpenClaw-Bridge'
$BridgeLogFile   = 'C:\ProgramData\OpenClaw-Bridge\logs\bridge.out.log'
$BridgeHealthUrl = 'http://127.0.0.1:3100/health'

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  $msg" -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host "  $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  $msg" -ForegroundColor Red }

# -----------------------------------------------------------------------------
Write-Step 'Stopping OpenClaw Gateway'
$gatewayProcs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like $GatewayPattern }

if ($gatewayProcs) {
  foreach ($p in $gatewayProcs) {
    Write-Host "  killing pid $($p.ProcessId)"
    try {
      Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
      Write-Ok "stopped"
    } catch {
      Write-Err "failed: $($_.Exception.Message)"
    }
  }
} else {
  Write-Warn2 'no running gateway process found (was it already down?)'
}
Start-Sleep -Seconds 1

# -----------------------------------------------------------------------------
Write-Step 'Starting OpenClaw Gateway'
if (-not (Test-Path $GatewayCmd)) {
  Write-Err "gateway launcher not found at $GatewayCmd — aborting"
  exit 1
}

# Start detached: new session, hidden window, no wait.
Start-Process -FilePath $GatewayCmd -WindowStyle Hidden
Write-Ok "launched $GatewayCmd"

# Wait for the port to come up, max 10s
$deadline = (Get-Date).AddSeconds(10)
$gatewayUp = $false
while ((Get-Date) -lt $deadline) {
  $conn = Test-NetConnection -ComputerName 127.0.0.1 -Port $GatewayPort -InformationLevel Quiet -WarningAction SilentlyContinue
  if ($conn) { $gatewayUp = $true; break }
  Start-Sleep -Milliseconds 500
}
if ($gatewayUp) {
  Write-Ok "gateway listening on port $GatewayPort"
} else {
  Write-Err "gateway did NOT come up on port $GatewayPort within 10s — check gateway logs"
}

# -----------------------------------------------------------------------------
Write-Step "Restarting $BridgeService service"
try {
  Restart-Service -Name $BridgeService -Force -ErrorAction Stop
  Write-Ok "restart issued"
} catch {
  Write-Err "failed to restart: $($_.Exception.Message)"
}

# Wait until service is Running, max 10s
$deadline = (Get-Date).AddSeconds(10)
$svcStatus = 'Unknown'
while ((Get-Date) -lt $deadline) {
  $svc = Get-Service -Name $BridgeService -ErrorAction SilentlyContinue
  if ($svc -and $svc.Status -eq 'Running') { $svcStatus = 'Running'; break }
  $svcStatus = if ($svc) { $svc.Status } else { 'Missing' }
  Start-Sleep -Milliseconds 500
}
if ($svcStatus -eq 'Running') {
  Write-Ok "service status: Running"
} else {
  Write-Warn2 "service status: $svcStatus"
}

# -----------------------------------------------------------------------------
Write-Step 'Bridge log (last 5 lines)'
if (Test-Path $BridgeLogFile) {
  Get-Content $BridgeLogFile -Tail 5 | ForEach-Object { Write-Host "  $_" }
} else {
  Write-Warn2 "log not found at $BridgeLogFile"
}

# -----------------------------------------------------------------------------
Write-Step 'Health checks'
try {
  $bridgeHealth = Invoke-RestMethod -Uri $BridgeHealthUrl -TimeoutSec 3 -ErrorAction Stop
  $uptime = [math]::Round($bridgeHealth.uptime, 1)
  Write-Ok "bridge: OK (uptime ${uptime}s)"
} catch {
  Write-Err "bridge: FAIL - $($_.Exception.Message)"
}

$gwConn = Test-NetConnection -ComputerName 127.0.0.1 -Port $GatewayPort -InformationLevel Quiet -WarningAction SilentlyContinue
if ($gwConn) {
  Write-Ok "gateway: OPEN on port $GatewayPort"
} else {
  Write-Err "gateway: CLOSED on port $GatewayPort"
}

Write-Host ''
Write-Host 'Done.' -ForegroundColor Cyan
