@echo off
setlocal

echo [RGMM] Installing dependencies...
call npm install
if errorlevel 1 exit /b 1

echo [RGMM] Building Electron portable...
call npm run build:electron
if errorlevel 1 exit /b 1

if exist dist\RGMM.exe (
  copy /Y dist\RGMM.exe RGMM.exe >nul
  echo [RGMM] Build complete: RGMM.exe
) else (
  echo [RGMM] Build failed: dist\RGMM.exe not found.
  exit /b 1
)
endlocal
