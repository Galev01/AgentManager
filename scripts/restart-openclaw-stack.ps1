<#
.SYNOPSIS
  Restart the full OpenClaw stack on Windows: gateway + bridge.

.DESCRIPTION
  1. Kills the running OpenClaw gateway node process (matched by command line
     containing 'openclaw' and 'gateway' and port 18789).
  2. Relaunches it via the user's C:\Users\GalLe\.openclaw\gateway.cmd,
     redirecting stdout/stderr to a log file so silent startup failures are
     diagnosable.
  3. Restarts the NSSM-managed OpenClaw-Bridge service. This step needs admin
     rights; if the script was started unelevated, it self-elevates just that
     one command via Start-Process -Verb RunAs (one UAC prompt).
  4. Prints health checks and tails the gateway log on failure.

.NOTES
  Gateway MUST run at the user's integrity level, not admin — the openclaw
  gateway fails to start when spawned from an elevated token. The script is
  therefore designed to run UNELEVATED. Do not re-add #Requires -RunAsAdministrator.
#>

$ErrorActionPreference = 'Continue'

$GatewayCmd      = 'C:\Users\GalLe\.openclaw\gateway.cmd'
$GatewayPattern  = '*openclaw*gateway*18789*'
$GatewayPort     = 18789
$GatewayLogDir   = 'C:\Users\GalLe\.openclaw\logs'
$GatewayOutLog   = Join-Path $GatewayLogDir 'gateway.out.log'
$GatewayErrLog   = Join-Path $GatewayLogDir 'gateway.err.log'
$BridgeService   = 'OpenClaw-Bridge'
$BridgeLogFile   = 'C:\ProgramData\OpenClaw-Bridge\logs\bridge.out.log'
$BridgeHealthUrl = 'http://127.0.0.1:3100/health'

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  $msg" -ForegroundColor Green }
function Write-Warn2($msg){ Write-Host "  $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  $msg" -ForegroundColor Red }

function Test-IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p  = [Security.Principal.WindowsPrincipal]::new($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# -----------------------------------------------------------------------------
# Gateway must run unelevated. If the user launched this script from an
# elevated shell, bail out with a clear message — otherwise the gateway will
# start then silently die and the user ends up here again.
if (Test-IsAdmin) {
  Write-Err 'This script is running ELEVATED.'
  Write-Err 'The OpenClaw gateway will not start correctly when spawned from an admin token.'
  Write-Err 'Close this window and run the script from a normal (non-admin) PowerShell prompt.'
  Write-Err 'The bridge service restart will self-elevate on its own via UAC.'
  exit 1
}

if (-not (Test-Path $GatewayLogDir)) {
  New-Item -ItemType Directory -Path $GatewayLogDir -Force | Out-Null
}

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
  Write-Err "gateway launcher not found at $GatewayCmd - aborting"
  exit 1
}

# Truncate previous logs so we don't confuse old output with this run.
Set-Content -Path $GatewayOutLog -Value '' -Encoding utf8
Set-Content -Path $GatewayErrLog -Value '' -Encoding utf8

# Start detached with stdout/stderr redirected so we can diagnose startup failures.
# WindowStyle Hidden keeps cmd.exe invisible. Redirection detaches stdio from
# the parent console, so the gateway survives this script exiting.
$proc = Start-Process -FilePath $GatewayCmd `
  -WindowStyle Hidden `
  -RedirectStandardOutput $GatewayOutLog `
  -RedirectStandardError $GatewayErrLog `
  -PassThru
Write-Ok "launched $GatewayCmd (wrapper pid $($proc.Id))"

# Wait for the port to come up, max 20s (gateway does agent/model bootstrap before binding).
$deadline  = (Get-Date).AddSeconds(20)
$gatewayUp = $false
while ((Get-Date) -lt $deadline) {
  $conn = Test-NetConnection -ComputerName 127.0.0.1 -Port $GatewayPort -InformationLevel Quiet -WarningAction SilentlyContinue
  if ($conn) { $gatewayUp = $true; break }
  Start-Sleep -Milliseconds 500
}
if ($gatewayUp) {
  Write-Ok "gateway listening on port $GatewayPort"
} else {
  Write-Err "gateway did NOT come up on port $GatewayPort within 20s"
  Write-Host ''
  Write-Host '--- gateway.out.log (last 20 lines) ---' -ForegroundColor Yellow
  if ((Test-Path $GatewayOutLog) -and ((Get-Item $GatewayOutLog).Length -gt 0)) {
    Get-Content $GatewayOutLog -Tail 20 | ForEach-Object { Write-Host "  $_" }
  } else { Write-Host '  (empty)' }
  Write-Host '--- gateway.err.log (last 20 lines) ---' -ForegroundColor Yellow
  if ((Test-Path $GatewayErrLog) -and ((Get-Item $GatewayErrLog).Length -gt 0)) {
    Get-Content $GatewayErrLog -Tail 20 | ForEach-Object { Write-Host "  $_" }
  } else { Write-Host '  (empty)' }
}

# -----------------------------------------------------------------------------
Write-Step "Restarting $BridgeService service"
# Restart-Service needs admin. Self-elevate just this step; one UAC prompt.
$elevatedCmd = "Restart-Service -Name '$BridgeService' -Force -ErrorAction Stop; exit 0"
try {
  $elevated = Start-Process -FilePath powershell.exe `
    -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command', $elevatedCmd `
    -Verb RunAs -WindowStyle Hidden -PassThru -Wait -ErrorAction Stop
  if ($elevated.ExitCode -eq 0) {
    Write-Ok 'restart issued (elevated)'
  } else {
    Write-Err "elevated restart exited with code $($elevated.ExitCode)"
  }
} catch {
  Write-Err "failed to launch elevated restart: $($_.Exception.Message)"
  Write-Warn2 "If you clicked 'No' on the UAC prompt, run the script again and click 'Yes'."
}

# Wait until service is Running, max 10s
$deadline  = (Get-Date).AddSeconds(10)
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
