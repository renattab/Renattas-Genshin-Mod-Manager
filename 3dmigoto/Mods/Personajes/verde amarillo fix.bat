@echo off
setlocal enabledelayedexpansion

:: Nos movemos a la carpeta que has arrastrado
cd /d "%~1"

echo Procesando archivos en: "%~1"
echo Esto va a ser un visto y no visto...

:: Recorremos todos los archivos (.txt, .gml, o lo que uses)
:: Si quieres que solo afecte a unos archivos concretos, cambia el *.*
for /r %%f in (*.*) do (
    set "archivo=%%f"
    
    :: Creamos un archivo temporal para guardar los cambios
    set "temp_file=%%f.tmp"
    
    if exist "!temp_file!" del "!temp_file!"

    for /f "usebackq delims=" %%l in ("%%f") do (
        set "linea=%%l"
        
        :: El truco del almendruco: 
        :: 1. Cambiamos ps-t0 por un placeholder temporal que no exista
        :: 2. Cambiamos ps-t1 por ps-t0
        :: 3. Cambiamos el placeholder por ps-t1
        set "linea=!linea:ps-t0=TEMP_SWAP_MARKER!"
        set "linea=!linea:ps-t1=ps-t0!"
        set "linea=!linea:ps-t2=ps-t2!" :: Esto no hace nada, solo para seguir el ritmo
        set "linea=!linea:TEMP_SWAP_MARKER=ps-t1!"
        
        echo !linea!>>"!temp_file!"
    )

    :: Cambiamos el original por el modificado
    move /y "!temp_file!" "%%f" >nul
)

echo.
echo ¡Hecho! Los ps-t0 ahora son ps-t1 y viceversa. 
echo Tus archivos de GMS2 están listos para la acción.
pause