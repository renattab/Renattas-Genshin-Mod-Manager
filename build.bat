@echo off
setlocal

echo [RGMM] Installing dependencies...
call npm install
if errorlevel 1 exit /b 1

echo [RGMM] Installing @yao-pkg/pkg (dev)...
call npm install -D @yao-pkg/pkg
if errorlevel 1 exit /b 1

echo [RGMM] Building RGMM.exe...
call npx @yao-pkg/pkg -t node18-win-x64 -o dist\RGMM.exe server.js
if errorlevel 1 exit /b 1

echo [RGMM] Build complete: dist\RGMM.exe
endlocal
