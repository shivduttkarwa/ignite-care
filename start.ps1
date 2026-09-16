# Starts the Ignite API and portal in two windows.
$root = $PSScriptRoot

Start-Process pwsh -ArgumentList @(
  "-NoExit", "-Command",
  "Set-Location '$root'; .\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8811"
)

Start-Process pwsh -ArgumentList @(
  "-NoExit", "-Command",
  "Set-Location '$root\frontend'; npm.cmd run dev -- --host 0.0.0.0"
)

$lan = (Get-NetIPConfiguration |
  Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq "Up" } |
  Select-Object -First 1).IPv4Address.IPAddress

Write-Host ""
Write-Host "  Portal         http://127.0.0.1:5173"
Write-Host "  Sign in        karen (worker) or sonia (manager) / ignite-demo-2026"
if ($lan) {
  Write-Host ""
  Write-Host "  On your phone  http://${lan}:5173      (same wifi)"
}
Write-Host ""
