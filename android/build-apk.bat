@echo off
REM =====================================================================
REM Build a debug APK for STOCRANT.
REM
REM JAVA_HOME must point at a JDK 21 (Android Studio ships one at
REM "C:\Program Files\Android\Android Studio\jbr"), and local.properties
REM must carry the Android SDK path. Both are machine-specific, so this
REM wrapper reads them from the environment instead of hard-coding them.
REM =====================================================================
setlocal

if not defined JAVA_HOME (
    echo ERROR: JAVA_HOME is not set.
    echo   Point it at your JDK, for example:
    echo   set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
    exit /b 1
)

REM local.properties is generated per machine and intentionally not committed.
if not exist local.properties (
    if defined LOCALAPPDATA (
        > local.properties echo sdk.dir=%LOCALAPPDATA%\Android\Sdk
        echo Created local.properties pointing at %LOCALAPPDATA%\Android\Sdk
    ) else (
        echo ERROR: local.properties is missing and the SDK path cannot be inferred.
        echo   Create it with a single line:  sdk.dir=C:\path\to\Android\Sdk
        exit /b 1
    )
)

call gradlew.bat assembleDebug --no-daemon
if errorlevel 1 (
    echo.
    echo BUILD FAILED
    exit /b 1
)

echo.
echo BUILD SUCCEEDED
echo APK: app\build\outputs\apk\debug\app-debug.apk
echo Install with: adb install -r app\build\outputs\apk\debug\app-debug.apk
endlocal
