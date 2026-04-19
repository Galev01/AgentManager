$target = "C:\Users\GalLe\Cursor projects\OpenClaw-manager\scripts\restart-bridge-service.ps1"
$transcript = "$env:TEMP\openclaw-bridge-restart.log"
try {
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-Command",
            "Start-Transcript -Path '$transcript' -Force; & '$target'; Stop-Transcript" `
        -Verb RunAs -Wait -ErrorAction Stop
    Write-Host "UAC-OK"
    if (Test-Path $transcript) { Get-Content $transcript -Tail 80 }
} catch {
    Write-Host ("UAC-DECLINED: " + $_.Exception.Message)
}
