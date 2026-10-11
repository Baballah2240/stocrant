# Finds the first connected Android device in ADB and installs the built APK.
#
# Several phones are plugged into this machine, so the script does not assume
# a serial: it lists every device, skips anything not fully authorised, and
# installs onto the first one that is ready. Pass -All to install on each one.

[CmdletBinding()]
param(
    [string]$Apk = "C:\Users\Lenovo\resturrant\stocrant\android\app\build\outputs\apk\debug\app-debug.apk",
    [switch]$All
)

$ErrorActionPreference = "Stop"
$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) { throw "adb not found at $adb" }
if (-not (Test-Path $Apk)) { throw "APK not found at $Apk. Run build-apk.ps1 first." }

# adb writes progress chatter to stderr, which PowerShell would otherwise treat
# as a terminating error. This wrapper merges the streams and returns plain text.
function Invoke-Adb {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $raw = & $adb @Arguments 2>&1 | Out-String
        return $raw
    } finally {
        $ErrorActionPreference = $prev
    }
}

Write-Host "Restarting ADB server..."
Invoke-Adb kill-server | Out-Null
Start-Sleep -Seconds 2
Invoke-Adb start-server | Out-Null
Start-Sleep -Seconds 3

# Parse `adb devices -l`. Column 1 is the serial, column 2 the state.
$lines = (Invoke-Adb devices) -split "`r?`n"
$ready = @()
foreach ($line in $lines) {
    if ($line -notmatch '^\S+\s+device\b') { continue }
    $serial = ($line -split '\s+')[0]
    $model = (Invoke-Adb -s $serial shell getprop ro.product.model).Trim()
    if (-not $model) { $model = "unknown" }
    $ready += [pscustomobject]@{ Serial = $serial; Model = $model }
}

if (-not $ready.Count) {
    Write-Host ""
    Write-Host "No authorised Android device found." -ForegroundColor Red
    Write-Host ""
    Write-Host "Raw 'adb devices' output:"
    $lines | ForEach-Object { Write-Host "  $_" }
    Write-Host ""
    Write-Host "Fix by checking, in order:"
    Write-Host "  1. Phone is unlocked and the USB cable supports data (not charge-only)."
    Write-Host "  2. Settings > Developer options > USB debugging is ON."
    Write-Host "  3. Tap 'Allow' on the 'Allow USB debugging?' prompt on the phone"
    Write-Host "     (tick 'Always allow from this computer')."
    Write-Host "  4. Pull down the notification and switch USB mode from 'Charging'"
    Write-Host "     to 'File transfer (MTP)' or 'PTP'."
    exit 1
}

Write-Host ""
Write-Host "Ready device(s):"
$ready | ForEach-Object { Write-Host ("  {0}  ({1})" -f $_.Serial, $_.Model) }
Write-Host ""

$targets = if ($All) { $ready } else { , $ready[0] }
$failed = 0

foreach ($device in $targets) {
    Write-Host "Installing onto $($device.Serial) ($($device.Model))..."
    (Invoke-Adb -s $device.Serial install -r $Apk).Trim() -split "`r?`n" | ForEach-Object { if ($_ -match '\S') { Write-Host "  $_" } }
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Installed successfully." -ForegroundColor Green
    } else {
        # Common, recoverable cause: an existing build was signed with a
        # different key, which Android refuses to overwrite.
        Write-Host "  Install failed; retrying after uninstalling the existing app." -ForegroundColor Yellow
        Invoke-Adb -s $device.Serial uninstall com.stocrant.app | Out-Null
        (Invoke-Adb -s $device.Serial install $Apk).Trim() -split "`r?`n" | ForEach-Object { if ($_ -match '\S') { Write-Host "  $_" } }
        if ($LASTEXITCODE -ne 0) { $failed++ }
    }
}

Write-Host ""
if ($failed -eq 0) {
    Write-Host "Done. Open the STOCRANT app on the phone, then in Access & Settings > Mobile app" -ForegroundColor Green
    Write-Host "enter your server address (for example https://stocrant.example.com)."
} else {
    Write-Host "$failed install(s) failed. See the messages above." -ForegroundColor Red
    exit 1
}
