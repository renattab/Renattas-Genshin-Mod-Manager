# AGENTS.md

## Proyecto
RGMM (Renatta's Genshin Mod Manager) es un mod manager local para Genshin basado en Node.js con wrapper de Electron. El servidor es HTTP nativo en `server.js`, el frontend vive en `public/` y Electron arranca todo desde `electron-main.js`.

## Objetivo
Mantener la app simple, offline-first y segura para rutas locales. Evitar dependencias innecesarias.

## Estructura clave
- Backend: `server.js`
- Frontend: `public/index.html`, `public/app.js`, `public/styles.css`
- Electron wrapper: `electron-main.js` (lanza servidor y carga UI)
- Datos: `3dmigoto/` (carpetas `Mods`, `Disable`, `Personajes`)
- Metadatos: `mminfo.txt` por mod de personaje (no usar `.json`)
- Ajustes: `settings.json`

## Rutas de mods (importante)
- Mods generales: `3dmigoto/Mods/`
- Mods de personajes: `3dmigoto/Mods/Personajes/`
- Fixes: archivos `.bat` o `.exe` dentro de `3dmigoto/Mods/Personajes/` (no son carpetas).
- Mods de personaje: carpetas dentro de `3dmigoto/Mods/Personajes/`.

## Lista de personajes (alias)
- La lista vive en `settings.json` bajo `characterNames`.
- Formato esperado: `NombrePrincipal/alias1/alias2/...` en cada entrada.

## GameBanana (import)
- El import de GameBanana usa el título con lógica existente "pegada con cinta".
- No cambiar esa lógica sin pedirlo explícitamente.

## Reglas de trabajo
- No mover ni renombrar carpetas bajo `3dmigoto/` sin pedirlo explícitamente.
- No tocar datos de usuario (mods reales) salvo que se solicite.
- Si hay cambios de comportamiento, documentarlos en `README.md`.
- Evitar añadir frameworks web completos; mantener HTTP nativo salvo necesidad clara.

## Convenciones de código
- Node.js: preferir funciones pequeñas, sin librerías nuevas si no aportan mucho.
- Frontend: mantener `state` como fuente de verdad en `public/app.js`.
- Validar rutas y entradas siempre que se toque filesystem.

## Tests y ejecución
- Ejecutar con `npm start`.
- Si se cambian endpoints, probar flujo básico en UI.
