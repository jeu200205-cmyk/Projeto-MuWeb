@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title MUWEB R90 FIX57 - Cape Link Matrix + Wing Presentation
echo ================================================================
echo  MUWEB R90 FIX57 - autoridade segura
echo ================================================================
where node >nul 2>nul || (echo [ERRO] Node.js nao encontrado.& pause & exit /b 1)
if not exist node_modules\three (
  echo [R90] Instalando dependencias exatas do package-lock.json...
  call npm ci --ignore-scripts --no-audit --no-fund || (echo [ERRO] npm ci falhou.& pause & exit /b 1)
)
node tools\start-r90-fix57-safe.cjs
if errorlevel 1 pause
