@echo off
setlocal DisableDelayedExpansion
pushd "%~dp0" >nul 2>&1
if errorlevel 1 goto :fail_root

title MUWEB R90 FIX91 - Instalar dependencias

echo ================================================================
echo  MUWEB R90 FIX91 - INSTALADOR DE DEPENDENCIAS NODE
echo  three 0.160.0 + ws 8.21.3 via package-lock.json
echo ================================================================

where node.exe >nul 2>&1
if errorlevel 1 goto :fail_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto :fail_npm
if not exist "package.json" goto :fail_package_json
if not exist "package-lock.json" goto :fail_package_lock

call npm.cmd ci --omit=dev --ignore-scripts --no-audit --no-fund
if errorlevel 1 goto :fail_npm_ci
if not exist "node_modules\three\build\three.module.js" goto :fail_three
if not exist "node_modules\ws\index.js" goto :fail_ws

echo [OK] Dependencias FIX91 prontas.
popd
endlocal
exit /b 0

:fail_root
echo [FALHA] Nao foi possivel entrar na pasta do pacote.
endlocal
exit /b 9
:fail_node
echo [FALHA] node.exe nao encontrado no PATH.
goto :fail_common
:fail_npm
echo [FALHA] npm.cmd nao encontrado no PATH.
goto :fail_common
:fail_package_json
echo [FALHA] package.json ausente.
goto :fail_common
:fail_package_lock
echo [FALHA] package-lock.json ausente.
goto :fail_common
:fail_npm_ci
echo [FALHA] npm ci nao concluiu.
goto :fail_common
:fail_three
echo [FALHA] three.module.js ausente apos npm ci.
goto :fail_common
:fail_ws
echo [FALHA] ws\index.js ausente apos npm ci.
:fail_common
popd
endlocal
exit /b 10
