$target = "C:\Users\GalLe\Cursor projects\OpenClaw-manager\scripts\install-bridge-service.ps1"
$transcript = "$env:TEMP\openclaw-bridge-install.log"
try {
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-Command",
            "Start-Transcript -Path '$transcript' -Force; & '$target'; Stop-Transcript" `
        -Verb RunAs -Wait -ErrorAction Stop
    Write-Host "UAC-OK"
    Write-Host "--- transcript ---"
    if (Test-Path $transcript) { Get-Content $transcript -Tail 120 }
} catch {
    Write-Host ("UAC-DECLINED: " + $_.Exception.Message)
}
