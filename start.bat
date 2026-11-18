@echo off
rem PokeBonk bot launcher. ASCII only on purpose: non-ASCII text breaks cmd parsing on some Windows locales.
setlocal
cd /d "%~dp0"

rem ---- find node: PATH first, then default install folders (works right after install, before PATH refreshes) ----
set "NODE="
for /f "delims=" %%i in ('where node 2^>nul') do if not defined NODE set "NODE=%%i"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"

rem ---- need Node 22+ (launcher uses the built-in WebSocket) ----
if not defined NODE goto install
"%NODE%" -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)"
if errorlevel 1 (
  echo Your Node.js is too old. Version 22 or newer is required.
  goto install
)
goto run

:install
echo.
echo Node.js was not found. The bot needs Node.js to run.
where winget >nul 2>nul
if errorlevel 1 goto manual
choice /c YN /m "Install Node.js LTS automatically now"
if errorlevel 2 goto manual
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
if exist "%ProgramFiles%\nodejs\node.exe" (
  set "NODE=%ProgramFiles%\nodejs\node.exe"
  goto run
)

:manual
echo.
echo Please download and install the LTS version from https://nodejs.org
echo then double-click start.bat again.
start "" https://nodejs.org/
pause
exit /b 1

:run
chcp 65001 >nul
"%NODE%" launcher.mjs %*
pause
