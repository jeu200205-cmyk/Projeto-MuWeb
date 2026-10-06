@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo [R90 FIX99] Node.js nao encontrado.& pause & exit /b 1)
if not exist node_modules\three\package.json (
  echo [R90 FIX99] Instalando dependencias...
  call npm ci --omit=dev || (echo [R90 FIX99] Falha ao instalar dependencias.& pause & exit /b 1)
)
node tools\start-r90-fix99-safe.cjs
if errorlevel 1 pause
