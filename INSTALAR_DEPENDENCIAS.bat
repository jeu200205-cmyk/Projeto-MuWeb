@echo off
setlocal DisableDelayedExpansion
pushd "%~dp0" >nul 2>&1
if errorlevel 1 goto :fail_root

title MUWEB R90 - Instalar dependencias Node

echo ================================================================
echo  MUWEB R90 - INSTALADOR DE DEPENDENCIAS NODE
echo  Correcao: caminhos com espacos e parenteses ^(ex.: FULL ^(1^)^)
echo  three 0.160.0 + ws 8.21.3 via package-lock.json
echo ================================================================
echo [INFO] Pasta do pacote:
cd

where node.exe >nul 2>&1
if errorlevel 1 goto :fail_node

where npm.cmd >nul 2>&1
if errorlevel 1 goto :fail_npm

if not exist "package.json" goto :fail_package_json
if not exist "package-lock.json" goto :fail_package_lock

echo [INFO] Node:
node.exe --version
if errorlevel 1 goto :fail_node_exec

echo [INFO] npm:
call npm.cmd --version
if errorlevel 1 goto :fail_npm_exec

echo [R90] Instalando dependencias exatas do package-lock.json...
call npm.cmd ci --omit=dev --ignore-scripts --no-audit --no-fund
if errorlevel 1 goto :fail_npm_ci

if not exist "node_modules\three\build\three.module.js" goto :fail_three
if not exist "node_modules\ws\index.js" goto :fail_ws

echo [OK] Dependencias R90 prontas.
popd
endlocal
exit /b 0

:fail_root
echo [FALHA] Nao foi possivel entrar na pasta deste pacote.
endlocal
exit /b 9

:fail_node
echo [FALHA] node.exe nao foi encontrado no PATH.
echo Instale/repare o Node.js e execute este BAT novamente.
goto :fail_common_10

:fail_npm
echo [FALHA] npm.cmd nao foi encontrado no PATH.
echo O Node existe, mas o npm nao esta disponivel. Repare a instalacao do Node.js.
popd
endlocal
exit /b 11

:fail_package_json
echo [FALHA] package.json nao existe na pasta do pacote.
popd
endlocal
exit /b 12

:fail_package_lock
echo [FALHA] package-lock.json nao existe na pasta do pacote.
popd
endlocal
exit /b 13

:fail_node_exec
echo [FALHA] node.exe foi encontrado, mas nao executou corretamente.
popd
endlocal
exit /b 17

:fail_npm_exec
echo [FALHA] npm.cmd foi encontrado, mas nao executou corretamente.
popd
endlocal
exit /b 18

:fail_npm_ci
echo.
echo [FALHA] npm ci nao concluiu.
echo Verifique internet, DNS, proxy e o log acima.
popd
endlocal
exit /b 14

:fail_three
echo [FALHA] three.module.js continua ausente apos npm ci.
popd
endlocal
exit /b 15

:fail_ws
echo [FALHA] ws\index.js continua ausente apos npm ci.
popd
endlocal
exit /b 16

:fail_common_10
popd
endlocal
exit /b 10
