<#
  Installs STOCRANT only on the expected Android handset after the owner has
  explicitly enabled and authorized Wireless debugging.

  The script never installs onto an arbitrary device found on the LAN: it asks
  Android for ro.serialno after ADB authorization and proceeds only if it
  exactly matches $ExpectedSerial.
#>
[CmdletBinding()]
param(
    [string]$ExpectedSerial = "AMEGJV5A23G10506",
    [string]$Apk = "$((Resolve-Path (Join-Path $PSScriptRoot '..')).Path)\android\app\build\outputs\apk\debug\app-debug.apk",
    [int]$WaitMinutes = 30
)

$ErrorActionPreference = "Continue"
$root = "$((Resolve-Path (Join-Path $PSScriptRoot '..')).Path)"
$log = Join-Path $root "v-wireless-expected-install.log"
$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"

function Write-InstallLog {
    param([string]$Message)
    "[{0:yyyy-MM-dd HH:mm:ss}] {1}" -f (Get-Date), $Message |
        Out-File -FilePath $log -Encoding utf8 -Append
}

function Invoke-AdbText {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    return (& $adb @Arguments 2>&1 | Out-String).Trim()
}

Remove-Item $log -Force -ErrorAction SilentlyContinue
if (-not (Test-Path $adb)) { Write-InstallLog "ERROR: adb.exe not found at $adb"; exit 1 }
if (-not (Test-Path $Apk)) { Write-InstallLog "ERROR: APK not found at $Apk"; exit 1 }

Write-InstallLog "Watching Wi-Fi ADB for expected handset serial $ExpectedSerial for $WaitMinutes minute(s)."
Write-InstallLog "No device can be paired or installed without the phone owner's Android authorization."
Invoke-AdbText start-server | Out-Null
$deadline = (Get-Date).AddMinutes($WaitMinutes)

while ((Get-Date) -lt $deadline) {
    # A paired Android 11+ Wireless debugging device advertises one of these
    # mDNS services. Connection attempts merely request its existing ADB
    # authorization; they cannot bypass the phone's pairing/approval screen.
    $mdns = Invoke-AdbText mdns services
    $endpoints = @(
        $mdns -split "`r?`n" |
        Where-Object { $_ -match "\t_adb(?:-tls-connect)?\._tcp\t" } |
        ForEach-Object {
            $parts = $_ -split "`t"
            if ($parts.Count -ge 3) { $parts[2].Trim() }
        } |
        Where-Object { $_ -match "^\d{1,3}(?:\.\d{1,3}){3}:\d+$" } |
        Select-Object -Unique
    )

    foreach ($endpoint in $endpoints) {
        $connection = Invoke-AdbText connect $endpoint
        if ($connection) { Write-InstallLog "ADB connect ${endpoint}: $connection" }
    }

    $ready = @(
        (Invoke-AdbText devices) -split "`r?`n" |
        Where-Object { $_ -match "^\S+\s+device\b" } |
        ForEach-Object { ($_ -split "\s+")[0] }
    )

    foreach ($transport in $ready) {
        $serial = Invoke-AdbText -s $transport shell getprop ro.serialno
        $manufacturer = Invoke-AdbText -s $transport shell getprop ro.product.manufacturer
        $model = Invoke-AdbText -s $transport shell getprop ro.product.model
        if ($serial -ne $ExpectedSerial) {
            Write-InstallLog "Ignoring authorized device $transport ($manufacturer $model, serial $serial); it is not the expected handset."
            continue
        }

        Write-InstallLog "Expected handset authorized: $transport ($manufacturer $model, serial $serial). Installing STOCRANT."
        $install = Invoke-AdbText -s $transport install -r $Apk
        Write-InstallLog "ADB install result: $install"
        if ($LASTEXITCODE -ne 0) {
            Write-InstallLog "ERROR: Install failed. Existing app data was not removed automatically."
            exit 1
        }

        $launch = Invoke-AdbText -s $transport shell monkey -p com.stocrant.app 1
        Write-InstallLog "Launch result: $launch"
        Write-InstallLog "COMPLETE: STOCRANT installed and launched on the expected handset."
        exit 0
    }

    Write-InstallLog "Waiting for the expected phone to enable/authorize Wireless debugging."
    Start-Sleep -Seconds 10
}

Write-InstallLog "TIMEOUT: Expected handset $ExpectedSerial did not become an authorized Wi-Fi ADB device."
exit 1