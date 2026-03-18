# Renatta's Genshin Mod Manager (RGMM)

App local en HTML + JavaScript para gestionar mods de `3dmigoto`.

## Requisitos

- Node.js 18+ recomendado

## Ejecutar

```bash
npm install
npm start
```

Abre `http://localhost:3210`.

## Lógica de carpetas

- Activos generales: `3dmigoto/Mods/*` (excepto `Personajes`)
- Activos personajes: `3dmigoto/Mods/Personajes/*`
- Inactivos generales: `3dmigoto/Disable/*` (excepto `Personajes`)
- Inactivos personajes: `3dmigoto/Disable/Personajes/*`

Cuando activas/desactivas, el manager mueve el mod entre `Mods` y `Disable`.

Carpetas generales ignoradas por diseño (no se listan como mods):

- `BufferValues`
- `TexFx-main`

## Metadatos por mod

Para personajes, usa `mminfo.txt` dentro de la carpeta del mod:

```txt
title: Nombre Bonito del Mod
character: Wriothesley
description: Tu descripcion
image: 0preview.png
```

También puedes editar este `mminfo` desde el botón `Editar mminfo` en la UI.
Se abre una ventana de formulario y la imagen se elige con selector de archivos de Windows.

## Lista de personajes

La columna derecha usa la lista de `characterNames`.

- Si existe `characterNames.txt`, esa lista tiene prioridad.
- Si no existe, RGMM usa `settings.json > characterNames`.

## Banner de actualización

Al arrancar, RGMM intenta comparar `version.txt` local con el `version.txt` del repo en GitHub.

- Si son distintos, muestra un banner arriba con enlace para descargar el source code en `.zip`.
- Si no hay internet o GitHub falla, no muestra nada y la app sigue funcionando normal.

## Fixes de personaje (.exe/.bat/.cmd)

Cada tarjeta de personaje incluye `Aplicar fix (.exe/.bat)`.

- Al pulsarlo, se abre una lista de fixes detectados en la carpeta de personajes.
- Seleccionas uno.
- El manager lo copia a la carpeta del mod de personaje y lo ejecuta automáticamente.

## Instalar mods de personaje por .zip

En la parte superior de la UI hay una zona para arrastrar y soltar `.zip`.

Reglas de instalación:

1. Si en la raíz del `.zip` hay archivos `.dds`, `.ib` o `.buf`, se considera mod directo.
2. En ese caso, se crea carpeta con el nombre del `.zip` dentro de `3dmigoto/Mods/Personajes`.
3. Si no hay esos archivos directos y hay una sola carpeta principal (aunque haya txt/readme sueltos), se copia esa carpeta tal cual a `Personajes`.

## Importar desde enlace web

Hay botón `Importar desde enlace` en la parte superior.

Lee automáticamente:

- Título: `h1#PageTitle`
- Descripción: `article.RichText`
- Versiones/descargas: módulo `#FilesModule`, tomando nombre de `.FileName` y link de `a.DownloadLink.GreenColor`
- Imágenes: `div.Gallery a[href]`

Flujo:

1. Pegas URL.
2. `Analizar`.
3. Eliges miniatura de galería.
4. Pulsas `Descargar e importar` en una versión.
5. Se instala en `Mods/Personajes` y se guarda `mminfo.txt` con título/personaje/descripción/imagen.

## Desinstalar mods

Cada tarjeta tiene botón `Desinstalar`.

- Borra el mod del disco (si está en `Mods` o `Disable`).
- Es eliminación permanente.
