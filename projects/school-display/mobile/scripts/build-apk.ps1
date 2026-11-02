# Builds a debug APK for testing. Gradle needs JDK 21; a newer JDK fails with
# "Unsupported class file major version".
$ErrorActionPreference = "Stop"
$mobile = Split-Path $PSScriptRoot -Parent
$android = Join-Path $mobile "android"

$jdk = Get-ChildItem "C:\jdks" -Directory -Filter "jdk-21*" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
if ($jdk) { $env:JAVA_HOME = $jdk }
if (-not $env:JAVA_HOME) { throw "Install JDK 21 under C:\jdks or set JAVA_HOME." }

$properties = Join-Path $android "local.properties"
if (-not (Test-Path $properties)) {
    $sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
    if (-not (Test-Path $sdk)) { throw "Android SDK not found. Set ANDROID_HOME." }
    Set-Content -Path $properties -Value ("sdk.dir=" + ($sdk -replace "\\", "\\")) -Encoding ascii
}

Push-Location $android
try {
    & .\gradlew.bat assembleDebug --no-daemon
    if ($LASTEXITCODE -ne 0) { throw "Gradle failed with exit code $LASTEXITCODE." }
} finally { Pop-Location }
Write-Host "APK: $android\app\build\outputs\apk\debug\app-debug.apk"
