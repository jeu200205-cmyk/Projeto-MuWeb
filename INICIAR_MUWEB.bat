@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title MUWEB R90 FIX154 - Official Data / current source

echo ================================================================
echo  MUWEB R90 FIX154 - PORTABILIDADE ATUAL / DATA OFICIAL
echo ================================================================
rem Fail before dependency installation when the sole official Data root is absent.
rem Completeness, canonical path, and generated-table provenance are checked by Node.
if not exist "C:\clientepromax\Nova pasta\MuPromax 1.0.1\Data\." (
  echo [ERRO] Data oficial obrigatorio ausente: C:\clientepromax\Nova pasta\MuPromax 1.0.1\Data
  echo [ERRO] Inicializacao bloqueada. Nenhum outro Data sera selecionado.
  pause
  exit /b 2
)
where node.exe >nul 2>&1 || (echo [ERRO] Node.js nao encontrado no PATH.& pause & exit /b 1)
if not exist "node_modules\three\build\three.module.js" (
  echo [R90] Dependencias ausentes. Instalando pelo package-lock.json...
  call "%~dp0INSTALAR_DEPENDENCIAS_R90.bat"
  if errorlevel 1 (echo [ERRO] Falha ao instalar dependencias.& pause & exit /b 1)
)
echo [FIX154] Iniciando runtime atual (serve.mjs), Data oficial preservado.
node.exe "%~dp0tools\verify-fix154-runtime.mjs"
if errorlevel 1 (echo [FIX154] Source instalada incompleta/inconsistente.& pause & exit /b 3)
node.exe "%~dp0tools\serve.mjs"
if errorlevel 1 pause
endlocal
