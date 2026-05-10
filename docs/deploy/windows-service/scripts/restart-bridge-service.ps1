#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"
$name = if ($env:BRIDGE_SERVICE_NAME) { $env:BRIDGE_SERVICE_NAME } else { "openclaw-manager-bridge" }
$log  = if ($env:BRIDGE_LOG_DIR)      { $env:BRIDGE_LOG_DIR }      else { Join-Path $env:ProgramData "$name\logs" }

& nssm restart $name | Out-Host
Start-Sleep -Seconds 3
& nssm status $name
Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue |
    Select-Object LocalAddress, LocalPort, OwningProcess | Format-Table -AutoSize
Write-Host "--- stdout tail ---"
Get-Content "$log\bridge.out.log" -Tail 15 -ErrorAction SilentlyContinue
Write-Host "--- stderr tail ---"
Get-Content "$log\bridge.err.log" -Tail 15 -ErrorAction SilentlyContinue
