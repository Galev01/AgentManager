#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

$ServiceName = "OpenClaw-Bridge"
$BridgeDir   = "C:\Users\GalLe\Cursor projects\OpenClaw-manager\apps\bridge"
$NodeExe     = "C:\Program Files\nodejs\node.exe"
$LogDir      = "$env:ProgramData\OpenClaw-Bridge\logs"

Write-Host "== Installing NSSM (if missing) =="
if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
    choco install nssm -y --no-progress | Out-Host
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
}
$Nssm = (Get-Command nssm).Source
Write-Host "nssm: $Nssm"

Write-Host "== Stopping any running bridge on :3100 =="
Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object {
        try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
    }

Write-Host "== Removing existing service (if any) =="
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    & $Nssm stop   $ServiceName | Out-Null
    & $Nssm remove $ServiceName confirm | Out-Null
}

Write-Host "== Creating service =="
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
& $Nssm install $ServiceName $NodeExe "--env-file=.env" "dist/server.js"
& $Nssm set $ServiceName AppDirectory $BridgeDir
& $Nssm set $ServiceName DisplayName "OpenClaw Manager Bridge"
& $Nssm set $ServiceName Description "Express API bridging OpenClaw Manager dashboard to the local OpenClaw Gateway."
& $Nssm set $ServiceName Start SERVICE_AUTO_START
& $Nssm set $ServiceName AppStdout "$LogDir\bridge.out.log"
& $Nssm set $ServiceName AppStderr "$LogDir\bridge.err.log"
& $Nssm set $ServiceName AppRotateFiles 1
& $Nssm set $ServiceName AppRotateOnline 1
& $Nssm set $ServiceName AppRotateBytes 10485760
& $Nssm set $ServiceName AppStopMethodConsole 15000
& $Nssm set $ServiceName AppExit Default Restart
& $Nssm set $ServiceName AppRestartDelay 5000

Write-Host "== Starting service =="
& $Nssm start $ServiceName
Start-Sleep -Seconds 3
& $Nssm status $ServiceName
Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue |
    Select-Object LocalAddress, LocalPort, State, OwningProcess | Format-Table -AutoSize
Write-Host "== Logs =="
Get-Content "$LogDir\bridge.out.log" -Tail 10 -ErrorAction SilentlyContinue
Get-Content "$LogDir\bridge.err.log" -Tail 10 -ErrorAction SilentlyContinue
