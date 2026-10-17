$ErrorActionPreference = "Continue"

$root = "$PSScriptRoot"
$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
$apk = Join-Path $root "android\app\build\outputs\apk\debug\app-debug.apk"
$log = Join-Path $root "v-usb-auto-install.log"

Remove-Item $log -Force -ErrorAction SilentlyContinue

function Write-InstallLog {
    param([string]$Message)
    "[{0:yyyy-MM-dd HH:mm:ss}] {1}" -f (Get-Date), $Message |
        Out-File -FilePath $log -Encoding utf8 -Append
}

if (-not (Test-Path $adb)) {
    Write-InstallLog "ERROR: adb.exe was not found at $adb"
    exit 1
}
if (-not (Test-Path $apk)) {
    Write-InstallLog "ERROR: APK was not found at $apk"
    exit 1
}

Write-InstallLog "STOCRANT USB installer started; waiting up to 30 minutes for an authorized Android device."
& $adb kill-server 2>&1 | Out-Null
& $adb start-server 2>&1 | Out-Null

$deadline = (Get-Date).AddMinutes(30)
while ((Get-Date) -lt $deadline) {
    $lines = & $adb devices 2>&1
    $target = $lines | Where-Object { $_ -match "^\S+\s+device\b" } | Select-Object -First 1

    if ($target) {
        $serial = ($target -split "\s+")[0]
        $model = (& $adb -s $serial shell getprop ro.product.model 2>&1 | Out-String).Trim()
        Write-InstallLog "Authorized device found: $serial ($model). Installing STOCRANT."

        $installOutput = & $adb -s $serial install -r $apk 2>&1 | Out-String
        $installOutput.Trim() | Out-File -FilePath $log -Encoding utf8 -Append
        if ($LASTEXITCODE -ne 0) {
            Write-InstallLog "Update install failed; removing any copy signed with a different key and retrying."
            & $adb -s $serial uninstall com.stocrant.app 2>&1 | Out-File -FilePath $log -Encoding utf8 -Append
            $installOutput = & $adb -s $serial install $apk 2>&1 | Out-String
            $installOutput.Trim() | Out-File -FilePath $log -Encoding utf8 -Append
        }

        if ($LASTEXITCODE -eq 0) {
            Write-InstallLog "Installation succeeded. Launching STOCRANT."
            & $adb -s $serial shell monkey -p com.stocrant.app 1 2>&1 |
                Out-File -FilePath $log -Encoding utf8 -Append
            Write-InstallLog "COMPLETE: STOCRANT is installed and launched."
            exit 0
        }

        Write-InstallLog "ERROR: Installation failed with ADB exit code $LASTEXITCODE."
        exit 1
    }

    Write-InstallLog "Waiting for USB debugging authorization. Unlock the phone and accept 'Allow USB debugging'."
    Start-Sleep -Seconds 10
}

Write-InstallLog "TIMEOUT: No authorized Android device appeared within 30 minutes."
exit 1