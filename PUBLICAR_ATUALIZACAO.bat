@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ==============================================
echo   Projeto MuWeb - Publicar Atualizacao
 echo ==============================================
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Git nao foi encontrado no PATH.
  echo Instale o Git for Windows e tente novamente.
  pause
  exit /b 1
)

if not exist ".git" (
  echo [ERRO] Esta pasta nao e um clone Git do Projeto-MuWeb.
  echo Clone primeiro: https://github.com/jeu200205-cmyk/Projeto-MuWeb.git
  pause
  exit /b 1
)

for /f "delims=" %%B in ('git branch --show-current') do set "BRANCH=%%B"
if /I not "!BRANCH!"=="main" (
  echo [ERRO] Branch atual: !BRANCH!
  echo Troque para a branch main antes de publicar.
  pause
  exit /b 1
)

echo [1/5] Conferindo atualizacoes remotas...
git fetch origin main
if errorlevel 1 goto :erro

echo [2/5] Verificando se a branch local pode ser atualizada...
git pull --ff-only origin main
if errorlevel 1 (
  echo.
  echo [ERRO] Existem divergencias locais/remotas.
  echo Nada foi publicado. Resolva o conflito antes de tentar novamente.
  pause
  exit /b 1
)

echo [3/5] Preparando todos os arquivos atuais...
git add -A
if errorlevel 1 goto :erro

git diff --cached --quiet
if not errorlevel 1 (
  echo.
  echo Nenhuma alteracao nova encontrada para publicar.
  pause
  exit /b 0
)

for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set "D=%%a-%%b-%%c"
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set "T=%%a%%b"

set "MSG=Atualiza source publica do Projeto MuWeb"

echo [4/5] Criando commit...
git commit -m "%MSG%"
if errorlevel 1 goto :erro

echo [5/5] Enviando para o GitHub...
git push origin main
if errorlevel 1 goto :erro

echo.
echo ==============================================
echo PUBLICACAO ENVIADA COM SUCESSO
echo ==============================================
echo O GitHub agora executara automaticamente:
echo - validacao da source publica
echo - testes/build quando configurados
echo - geracao do CHANGELOG.md
echo - criacao da tag publica
echo - criacao da GitHub Release
echo.
echo Nomes internos como FIX53 nao sao usados na release publica.
echo.
pause
exit /b 0

:erro
echo.
echo [ERRO] A publicacao foi interrompida. Nada adicional sera enviado por este script.
pause
exit /b 1
