@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\web-runtime-control-r90.ps1" -Action Stop
set ERR=%ERRORLEVEL%
endlocal & exit /b %ERR%
