@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\web-runtime-control-r90.ps1" -Action Stop
exit /b %ERRORLEVEL%
