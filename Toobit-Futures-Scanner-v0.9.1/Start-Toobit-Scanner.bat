@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or is not on PATH.
  echo Install the current LTS version from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
start "Toobit Scanner Server" /min cmd /k "cd /d ""%~dp0"" && node server.js"
timeout /t 2 /nobreak >nul
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "http://127.0.0.1:4173"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "http://127.0.0.1:4173"
) else (
  start "" "http://127.0.0.1:4173"
)
endlocal
