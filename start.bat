@echo off
setlocal

if "%RGMM_HIDDEN%"=="" (
  powershell -NoProfile -WindowStyle Hidden -Command "$env:RGMM_HIDDEN='1'; Start-Process -WindowStyle Hidden -FilePath $env:ComSpec -ArgumentList '/c','\"%~f0\"' -Wait"
  exit /b 0
)

where node >nul 2>&1
if errorlevel 1 (
  echo [RGMM] Node.js no esta instalado o no esta en PATH.
  echo [RGMM] Descargalo desde https://nodejs.org/
  pause
  exit /b 1
)

if not exist node_modules\.bin\electron.cmd (
  echo [RGMM] Installing dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)

call npm start
endlocal
