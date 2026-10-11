# Builds an installable debug APK for the Android app.
#
# Handles the two things that otherwise stop this working on a fresh machine:
#
#  1. JDK selection. Android Studio's bundled JBR is Java 25, which Gradle
#     8.14.3 rejects ("Unsupported class file major version 69"). A JDK 21
#     installed under C:\jdks is preferred.
#  2. SDK path. Gradle needs sdk.dir, which lives in android/local.properties
#     (git-ignored because it is machine-specific).
#
# Usage:  powershell -ExecutionPolicy Bypass -File build-apk.ps1

$ErrorActionPreference = "Stop"

# Resolve from the script's own location, not the caller's working directory.
$repoRoot = $PSScriptRoot
$androidDir = Join-Path $repoRoot "android"
$apk = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"

# ── 1. Pick a JDK Gradle 8.14.3 understands ────────────────────────────────
$jdk21 = Get-ChildItem "C:\jdks" -Directory -Filter "jdk-21*" -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
$studioJbr = "C:\Program Files\Android\Android Studio\jbr"

if ($jdk21 -and (Test-Path "$jdk21\bin\java.exe")) {
    Write-Host "Using JDK 21 at $jdk21"
    $javaHome = $jdk21
} elseif (Test-Path "$studioJbr\bin\java.exe") {
    Write-Warning "No JDK 21 under C:\jdks; using Android Studio's JBR (Java 25)."
    Write-Warning "If this fails with 'Unsupported class file major version', install a JDK 21 to C:\jdks."
    $javaHome = $studioJbr
} else {
    throw "No usable JDK found. Install a JDK 21 to C:\jdks, or set JAVA_HOME."
}

$env:JAVA_HOME = $javaHome
$env:Path = "$javaHome\bin;$env:Path"

# ── 2. Make sure Gradle can find the Android SDK ────────────────────────────
$localProps = Join-Path $androidDir "local.properties"
$sdkDir = Join-Path $env:LOCALAPPDATA "Android\Sdk"
if (-not (Test-Path $localProps) -and (Test-Path $sdkDir)) {
    Write-Host "Writing sdk.dir to android/local.properties"
    Set-Content -Path $localProps -Value "sdk.dir=$sdkDir" -Encoding ascii
}

# ── 3. Build the web bundle so the APK contains the latest UI ───────────────
Write-Host "Building web assets..."
Push-Location $repoRoot
try {
    & node ".\node_modules\vite\bin\vite.js" build
    if ($LASTEXITCODE -ne 0) { throw "Vite build failed with exit code $LASTEXITCODE" }
    & npx --no-install cap sync
    if ($LASTEXITCODE -ne 0) { throw "cap sync failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

# ── 4. Compile the APK ─────────────────────────────────────────────────────
Write-Host "Assembling debug APK..."
Push-Location $androidDir
try {
    & .\gradlew.bat assembleDebug --no-daemon
    if ($LASTEXITCODE -ne 0) { throw "Gradle failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

if (-not (Test-Path $apk)) {
    throw "Gradle reported success but no APK was found at $apk"
}

$size = [math]::Round((Get-Item $apk).Length / 1MB, 2)
Write-Host ""
Write-Host "APK built: $apk ($size MB)"
Write-Host "Install on a connected device with:"
Write-Host "  adb install -r `"$apk`""
