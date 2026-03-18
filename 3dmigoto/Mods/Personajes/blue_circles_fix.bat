@echo off
setlocal EnableExtensions EnableDelayedExpansion

echo ==== Blue Circles Fix ====
title Blue circle fix
echo.

REM Find INI files in script folder and subfolders
set "count=0"
set "root=%~dp0"
if not "%root:~-1%"=="\" set "root=%root%\"
set "psfile=%temp%\blue_circles_fix.ps1"
call :write_ps1 "%psfile%"
for /f "delims=" %%F in ('dir /b /s /a:-d "%root%*.ini" 2^>nul') do (
  set /a count+=1
  call :store_ini "%%F" !count!
)

if "%count%"=="0" (
  echo No se encontraron archivos .ini en esta carpeta.
  echo Coloca este .bat dentro de la carpeta del mod y vuelve a intentar.
  goto :eof
)

echo Se encontraron %count% INI:
echo.
:choose
for /l %%I in (1,1,%count%) do (
  if "!skip%%I!"=="1" (
    echo %%I - !rel%%I! - skip
  ) else (
    echo %%I - !rel%%I! - scan
  )
)
echo.
set "choice="
set /p "choice=Escribe numeros para alternar skip (ej: 1 3 5) o Enter para continuar: "
if not defined choice goto :process
for %%N in (%choice%) do (
  if defined ini%%N (
    if "!skip%%N!"=="1" (set "skip%%N=0") else (set "skip%%N=1")
  )
)
echo.
cls
title %TITLE_TAG%
goto :choose

:process
echo.
echo Iniciando procesamiento de INI...
echo.
for /l %%I in (1,1,%count%) do (
  if not "!skip%%I!"=="1" (
    set "target=!ini%%I!"
    echo ==== INI: "!rel%%I!" ====
    call :run_ps
    echo.
  )
)
echo Listo.
echo.
pause
exit /b

:run_ps
setlocal
set "target=%target%"
set "backup=%target%.BACKUPBLUECIRCLES"
copy /y "%target%" "%backup%" >nul
if not exist "%backup%" (
  echo Error: No se pudo crear el backup.
  endlocal & exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%psfile%" -iniPath "%target%"

if errorlevel 3 (
  echo Aviso: Se encontro la seccion, pero no habia ps-t0 para cambiar.
  endlocal & exit /b 0
)
if errorlevel 5 (
  echo Error: No se pudo detectar el personaje en este INI.
  endlocal & exit /b 0
)
if errorlevel 6 (
  echo Error: No se pudo verificar el cambio en el INI.
  endlocal & exit /b 0
)
if errorlevel 2 (
  echo Error: No se encontro la seccion esperada en el INI.
  endlocal & exit /b 0
)
if errorlevel 1 (
  echo Error: Fallo la ejecucion de PowerShell.
  endlocal & exit /b 0
)

echo Cambio aplicado correctamente.
endlocal & exit /b 0

:store_ini
setlocal EnableDelayedExpansion
set "ini=%~1"
for %%D in ("%~dp1.") do set "folder=%%~nD"
set "rel=%~1"
set "rel=!rel:%root%=!"
if "!rel:~0,1!"=="\" set "rel=!rel:~1!"
endlocal & (
  set "ini%2=%ini%"
  set "folder%2=%folder%"
  set "rel%2=%rel%"
)
exit /b 0

:write_ps1
setlocal DisableDelayedExpansion
set "psfile=%~1"
> "%psfile%" echo param([string]$iniPath)
>> "%psfile%" echo $ErrorActionPreference = 'Stop'
>> "%psfile%" echo try {
>> "%psfile%" echo   $iniPath = Resolve-Path -LiteralPath $iniPath
>> "%psfile%" echo   $lines = Get-Content -LiteralPath $iniPath
>> "%psfile%" echo   $sectionNames = @()
>> "%psfile%" echo   foreach ($line in $lines) {
>> "%psfile%" echo     $t = $line.Trim()
>> "%psfile%" echo     if ($t.StartsWith('[') -and $t.EndsWith(']')) {
>> "%psfile%" echo       $name = $t.Substring(1, $t.Length-2)
>> "%psfile%" echo       if ($name.StartsWith('TextureOverride')) { $sectionNames += $name }
>> "%psfile%" echo     }
>> "%psfile%" echo   }
>> "%psfile%" echo   $trimmed = @()
>> "%psfile%" echo   foreach ($s in $sectionNames) {
>> "%psfile%" echo     $t = $s.Substring(15)
>> "%psfile%" echo     if ($t -ne '') { $trimmed += $t }
>> "%psfile%" echo   }
>> "%psfile%" echo   $candidates = @()
>> "%psfile%" echo   if ($trimmed.Count -gt 0) {
>> "%psfile%" echo     $minLen = 3
>> "%psfile%" echo     function Get-CommonPrefixLen($a, $b) {
>> "%psfile%" echo       $max = [Math]::Min($a.Length, $b.Length)
>> "%psfile%" echo       $i = 0; while ($i -lt $max -and $a[$i] -eq $b[$i]) { $i++ }
>> "%psfile%" echo       return $i
>> "%psfile%" echo     }
>> "%psfile%" echo     $cluster = @()
>> "%psfile%" echo     foreach ($a in $trimmed) {
>> "%psfile%" echo       $ok = $false
>> "%psfile%" echo       foreach ($b in $trimmed) {
>> "%psfile%" echo         if ($a -ne $b -and (Get-CommonPrefixLen $a $b) -ge $minLen) { $ok = $true; break }
>> "%psfile%" echo       }
>> "%psfile%" echo       if ($ok) { $cluster += $a }
>> "%psfile%" echo     }
>> "%psfile%" echo     if ($cluster.Count -eq 0) { $cluster = $trimmed }
>> "%psfile%" echo     $global = @{}
>> "%psfile%" echo     foreach ($name in $cluster) {
>> "%psfile%" echo       $seen = @{}
>> "%psfile%" echo       for ($len = $minLen; $len -le $name.Length; $len++) {
>> "%psfile%" echo         $prefix = $name.Substring(0, $len)
>> "%psfile%" echo         if (-not $seen.ContainsKey($prefix)) { $seen[$prefix] = $true }
>> "%psfile%" echo       }
>> "%psfile%" echo       foreach ($k in $seen.Keys) {
>> "%psfile%" echo         if ($global.ContainsKey($k)) { $global[$k] += 1 } else { $global[$k] = 1 }
>> "%psfile%" echo       }
>> "%psfile%" echo     }
>> "%psfile%" echo     $ordered = $global.GetEnumerator() ^| Sort-Object @{Expression={$_.Value};Descending=$true}, @{Expression={$_.Key.Length};Descending=$true} ^| Select-Object -First 2
>> "%psfile%" echo     foreach ($item in $ordered) { if ($item.Key.Length -ge $minLen) { $candidates += $item.Key } }
>> "%psfile%" echo   }
>> "%psfile%" echo   $detected = $null
>> "%psfile%" echo   if ($candidates.Count -gt 0) { $detected = $candidates[0] }
>> "%psfile%" echo   if (-not $detected) { $detected = Read-Host "Escribe el nombre del personaje (ej: RaidenShogun)" }
>> "%psfile%" echo   if (-not $detected) { Write-Host "Cancelado: nombre vacio."; exit 1 }
>> "%psfile%" echo   $section = "TextureOverride" + $detected + "FaceHeadDiffuse"
>> "%psfile%" echo   $fallback = "CommandList" + $detected + "FaceHeadDiffuse"
>> "%psfile%" echo   $inSection = $false; $changed = $false; $foundSection = $false; $changedCount = 0
>> "%psfile%" echo   for ($i=0; $i -lt $lines.Count; $i++) {
>> "%psfile%" echo     $line = $lines[$i]
>> "%psfile%" echo     $t = $line.Trim()
>> "%psfile%" echo     if ($t.StartsWith('[') -and $t.EndsWith(']')) {
>> "%psfile%" echo       $currentSection = $t.Substring(1, $t.Length-2)
>> "%psfile%" echo       if ($currentSection -eq $section) { $inSection = $true; $foundSection = $true } else { $inSection = $false }
>> "%psfile%" echo     }
>> "%psfile%" echo     if ($inSection -and $t.StartsWith('ps-t0')) {
>> "%psfile%" echo       $prefix = $line.Substring(0, $line.Length - $line.TrimStart().Length)
>> "%psfile%" echo       $rhs = $line.Split('=',2)[1].Trim()
>> "%psfile%" echo       $lines[$i] = $prefix + "this = " + $rhs
>> "%psfile%" echo       $changed = $true; $changedCount++
>> "%psfile%" echo     }
>> "%psfile%" echo   }
>> "%psfile%" echo   if (-not $foundSection -or -not $changed) {
>> "%psfile%" echo     $inSection = $false; $foundFallback = $false; $changedFallback = $false; $changedFallbackCount = 0
>> "%psfile%" echo     for ($i=0; $i -lt $lines.Count; $i++) {
>> "%psfile%" echo       $line = $lines[$i]
>> "%psfile%" echo       $t = $line.Trim()
>> "%psfile%" echo       if ($t.StartsWith('[') -and $t.EndsWith(']')) {
>> "%psfile%" echo         $currentSection = $t.Substring(1, $t.Length-2)
>> "%psfile%" echo         if ($currentSection -eq $fallback) { $inSection = $true; $foundFallback = $true } else { $inSection = $false }
>> "%psfile%" echo       }
>> "%psfile%" echo       if ($inSection -and $t.StartsWith('ps-t0')) {
>> "%psfile%" echo         $prefix = $line.Substring(0, $line.Length - $line.TrimStart().Length)
>> "%psfile%" echo         $rhs = $line.Split('=',2)[1].Trim()
>> "%psfile%" echo         $lines[$i] = $prefix + "this = " + $rhs
>> "%psfile%" echo         $changedFallback = $true; $changedFallbackCount++
>> "%psfile%" echo       }
>> "%psfile%" echo     }
>> "%psfile%" echo     if ($foundFallback) { $foundSection = $true }
>> "%psfile%" echo     if ($changedFallback) { $changed = $true; $changedCount += $changedFallbackCount }
>> "%psfile%" echo   }
>> "%psfile%" echo   Set-Content -LiteralPath $iniPath -Value $lines -Encoding UTF8
>> "%psfile%" echo   if (-not $foundSection) { Write-Host ("No se encontro la seccion: " + $section); exit 2 }
>> "%psfile%" echo   if (-not $changed) { Write-Host "Seccion encontrada pero no se encontro ps-t0 para cambiar."; exit 3 }
>> "%psfile%" echo   Write-Host ("Lineas cambiadas: " + $changedCount)
>> "%psfile%" echo   Write-Host "Listo."
>> "%psfile%" echo } catch { Write-Host ("ERROR: " + $_.Exception.Message); exit 1 }
endlocal & exit /b 0
