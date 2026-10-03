@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale Node.js 18 ou superior e abra este arquivo novamente.
  pause
  exit /b 1
)
if /i "%~1"=="web" goto web
if /i "%~1"=="gateway" goto gateway
if /i "%~1"=="assets" goto assets
where npm >nul 2>nul
if errorlevel 1 (
  echo npm nao encontrado. Reinstale Node.js com npm.
  pause
  exit /b 1
)
call npm install
if errorlevel 1 (
  echo Falha ao instalar dependencias. Confira a conexao e o erro acima.
  pause
  exit /b 1
)
if not defined MUWEB_DATA set "MUWEB_DATA=%~2"
if not defined MUWEB_DATA if exist "%~dp0Data\" set "MUWEB_DATA=%~dp0Data"
if not defined MUWEB_DATA set /p "MUWEB_DATA=Informe o caminho completo da pasta Data: "
set "MUWEB_DATA=%MUWEB_DATA:"=%"
if not exist "%MUWEB_DATA%\" (
  echo Pasta Data inexistente.
  pause
  exit /b 1
)
start "MuWeb - Assets 9100" "%ComSpec%" /d /c call "%~f0" assets
start "MuWeb - Gateway 9091" "%ComSpec%" /d /c call "%~f0" gateway
start "MuWeb - Web 8080" "%ComSpec%" /d /c call "%~f0" web
echo Servicos iniciando nas tres janelas. Confira os logs.
echo Abra http://127.0.0.1:8080/ quando o servidor Web estiver pronto.
echo Para parar, pressione Ctrl+C em cada janela.
echo ConnectServer e GameServer MU devem ser iniciados separadamente.
pause
exit /b 0
:web
node tools/dev-web-server.cjs 8080
goto finished
:gateway
node gateway-server.cjs
goto finished
:assets
if not defined MUWEB_DATA set /p "MUWEB_DATA=Informe o caminho completo da pasta Data: "
set "MUWEB_DATA=%MUWEB_DATA:"=%"
if not exist "%MUWEB_DATA%\" (
  echo Pasta Data inexistente.
  pause
  exit /b 1
)
node tools/asset-server.cjs "%MUWEB_DATA%" 9100
:finished
echo Servico encerrado. Confira as mensagens acima.
pause
