@echo off
REM Thin wrapper that supplies JAVA_HOME for this invocation only, then defers
REM to build-apk.bat. Using a file avoids quoting problems when launching from
REM PowerShell with a JDK path that contains spaces.
setlocal
if "%JAVA_HOME%"=="" set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
call "%~dp0build-apk.bat" > "%~dp0..\v-apk4.log" 2>&1
echo EXIT=%ERRORLEVEL% >> "%~dp0..\v-apk4.log"
endlocal

