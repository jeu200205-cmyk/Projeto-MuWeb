@echo off
setlocal DisableDelayedExpansion
pushd "%~dp0" >nul 2>&1
if errorlevel 1 exit /b 9
title MUWEB R90 FIX53 - Element Pets Helper Movement Summoner Skills
where node.exe >nul 2>&1
if errorlevel 1 goto :fail_node
if exist "node_modules\three\build\three.module.js" if exist "node_modules\ws\index.js" goto :deps_ok
call "%~dp0INSTALAR_DEPENDENCIAS_R90.bat"
if errorlevel 1 goto :fail_deps
:deps_ok
node.exe "%~dp0tools\start-r90-fix53-safe.cjs"
set "MUWEB_FIX53_RC=%ERRORLEVEL%"
popd
endlocal & exit /b %MUWEB_FIX53_RC%
:fail_node
echo [FALHA] node.exe nao foi encontrado no PATH.
popd
endlocal & exit /b 10
:fail_deps
echo [FALHA] Dependencias incompletas.
popd
endlocal & exit /b 20
