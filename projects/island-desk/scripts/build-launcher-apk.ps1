# Builds the Island Launcher Android app (debug-signed APK) and copies it to release\launcher\.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\build-launcher-apk.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# Gradle 8 needs JDK 21 (Android Studio's bundled Java 25 is too new).
$jdk = Get-ChildItem "C:\jdks" -Directory -Filter "jdk-21*" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
if (-not $jdk) { $jdk = "C:\Program Files\Android\Android Studio\jbr" }
if (-not (Test-Path "$jdk\bin\java.exe")) { throw "No JDK found. Install JDK 21 to C:\jdks." }
$env:JAVA_HOME = $jdk; $env:Path = "$jdk\bin;$env:Path"

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
if (-not (Test-Path $sdk)) { throw "Android SDK not found at $sdk." }
Set-Content "android\local.properties" ("sdk.dir=" + ($sdk -replace '\\', '\\')) -Encoding ascii

node scripts/build-launcher-web.mjs
if ($LASTEXITCODE) { throw "Web build failed." }
npx cap sync android
if ($LASTEXITCODE) { throw "Capacitor sync failed." }

Push-Location android
try { .\gradlew.bat assembleDebug --no-daemon -q; if ($LASTEXITCODE) { throw "Gradle build failed." } } finally { Pop-Location }

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$out = Join-Path $root "release\launcher"; New-Item -ItemType Directory -Force $out | Out-Null
$apk = Join-Path $out "Island-Launcher-$version.apk"
Copy-Item "android\app\build\outputs\apk\debug\app-debug.apk" $apk -Force
"Built $apk ($([math]::Round((Get-Item $apk).Length / 1MB, 1)) MB)"
