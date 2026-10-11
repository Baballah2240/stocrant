# Builds a debug APK preconfigured for the current PC Wi-Fi STOCRANT server.
# This is for trusted local-network testing only; use HTTPS for production.

$ErrorActionPreference = "Stop"
$wifi = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.InterfaceAlias -eq "Wi-Fi" -and $_.IPAddress -notmatch "^(127|169\.254)\." } |
    Select-Object -First 1 -ExpandProperty IPAddress

if (-not $wifi) {
    throw "No Wi-Fi IPv4 address was found. Connect this PC to the same Wi-Fi network as the phone."
}

$env:VITE_API_BASE_URL = "http://${wifi}:3000"
Write-Host "Building mobile LAN APK for $env:VITE_API_BASE_URL"
& (Join-Path $PSScriptRoot "build-apk.ps1")
if ($LASTEXITCODE -ne 0) { throw "LAN APK build failed with exit code $LASTEXITCODE" }