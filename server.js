// pkg + undici quirk: define File for fetch internals in bundled builds.
if (typeof globalThis.File === "undefined") {
  globalThis.File = class File {};
}

const fs = require("fs/promises");
const fssync = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { URL } = require("url");
const cheerio = require("cheerio");

const PORT = 3210;
const ROOT_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const STARTUP_URL = `http://localhost:${PORT}`;
let serverRef = null;

const MIGOTO_DIR = path.join(ROOT_DIR, "3dmigoto");
const CHAR_PORTRAIT_DIR = path.join(ROOT_DIR, "charportrait");
const MODS_DIR = path.join(MIGOTO_DIR, "Mods");
const DISABLE_DIR = path.join(MIGOTO_DIR, "Disable");
const CHARACTERS_SUBDIR = "Personajes";
const GENERAL_IGNORED_FOLDERS = new Set(["BufferValues", "TexFx-main"]);
const ALLOWED_FIX_EXTENSIONS = new Set([".exe", ".bat", ".cmd"]);
const ALLOWED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);
const MOD_FILE_EXTENSIONS = new Set([".dds", ".ib", ".buf"]);
const ALLOWED_ARCHIVE_EXTENSIONS = new Set([".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".tar.gz"]);
const MAX_JSON_BODY_BYTES = 350 * 1024 * 1024;
const SETTINGS_PATH = path.join(ROOT_DIR, "settings.json");
const DEFAULT_SETTINGS = {
  paths: {
    gimi: "",
    genshin: "",
  },
  characterNames: [],
  hideEmptyCharacters: false,
  theme: {
    primary: "#255ea4",
    uninstall: "#4a1f28",
    deactivate: "#d17b49",
    conflict: "#875b2d",
    btnGimi: "#2fbf71",
    btnGenshin: "#d17b49",
    btnGamebanana: "#2a6de0",
    btnSettings: "#6a4cc2",
    btnOpenFolder: "#6a4cc2",
    btnExit: "#4a1f28",
  },
};

function browserLikeHeaders() {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };
}

function openBrowser(url) {
  if (process.env.RGMM_ELECTRON === "1") return;
  let child;
  if (process.platform === "win32") {
    child = spawn("cmd.exe", ["/c", "start", "", url], {
      stdio: "ignore",
      detached: true,
    });
  } else if (process.platform === "darwin") {
    child = spawn("open", [url], { stdio: "ignore", detached: true });
  } else {
    child = spawn("xdg-open", [url], { stdio: "ignore", detached: true });
  }
  child.unref();
}

async function openFolder(folderPath) {
  const stat = await statSafe(folderPath);
  if (!stat || !stat.isDirectory()) {
    throw new Error("No se encontró la carpeta de 3dmigoto.");
  }
  let child;
  if (process.platform === "win32") {
    child = spawn("explorer.exe", [folderPath], { stdio: "ignore", detached: true, windowsHide: false });
  } else if (process.platform === "darwin") {
    child = spawn("open", [folderPath], { stdio: "ignore", detached: true });
  } else {
    child = spawn("xdg-open", [folderPath], { stdio: "ignore", detached: true });
  }
  child.unref();
}

function requestExit() {
  setTimeout(() => {
    if (serverRef) {
      serverRef.close(() => process.exit(0));
    } else {
      process.exit(0);
    }
  }, 100);
}

async function ensureBaseDirs() {
  await fs.mkdir(MODS_DIR, { recursive: true });
  await fs.mkdir(DISABLE_DIR, { recursive: true });
  await fs.mkdir(path.join(MODS_DIR, CHARACTERS_SUBDIR), { recursive: true });
  await fs.mkdir(path.join(DISABLE_DIR, CHARACTERS_SUBDIR), { recursive: true });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, statusCode, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > MAX_JSON_BODY_BYTES) {
        reject(new Error("Body demasiado grande"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("JSON inválido"));
      }
    });
    req.on("error", reject);
  });
}

function sanitizeEntryName(entryName) {
  if (typeof entryName !== "string" || !entryName.trim()) {
    throw new Error("Nombre de mod inválido");
  }
  const trimmed = entryName.trim();
  if (trimmed !== path.basename(trimmed) || trimmed.includes("..")) {
    throw new Error("Nombre de mod inseguro");
  }
  return trimmed;
}

function normalizeType(type) {
  if (type === "character") return "character";
  if (type === "general") return "general";
  throw new Error("Tipo de mod inválido");
}

function normalizeMetaKey(key) {
  return key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function pickMetaValue(meta, keys) {
  for (const key of keys) {
    const normalized = normalizeMetaKey(key);
    if (typeof meta[normalized] === "string" && meta[normalized].trim()) {
      return meta[normalized].trim();
    }
  }
  return "";
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizePersonNameForMatch(value) {
  return normalizeWhitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeSettings(input) {
  const raw = input && typeof input === "object" ? input : {};
  const rawPaths = raw.paths && typeof raw.paths === "object" ? raw.paths : {};

  const settings = {
    paths: {
      gimi: normalizeWhitespace(rawPaths.gimi || ""),
      genshin: normalizeWhitespace(rawPaths.genshin || ""),
    },
    characterNames: [],
    hideEmptyCharacters: Boolean(raw.hideEmptyCharacters),
    theme: {
      primary: DEFAULT_SETTINGS.theme.primary,
      uninstall: DEFAULT_SETTINGS.theme.uninstall,
      deactivate: DEFAULT_SETTINGS.theme.deactivate,
      conflict: DEFAULT_SETTINGS.theme.conflict,
      btnGimi: DEFAULT_SETTINGS.theme.btnGimi,
      btnGenshin: DEFAULT_SETTINGS.theme.btnGenshin,
      btnGamebanana: DEFAULT_SETTINGS.theme.btnGamebanana,
      btnSettings: DEFAULT_SETTINGS.theme.btnSettings,
    },
  };

  const rawTheme = raw.theme && typeof raw.theme === "object" ? raw.theme : {};
  const normalizeHex = (value, fallback) => {
    const text = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : fallback;
  };
  settings.theme.primary = normalizeHex(rawTheme.primary, settings.theme.primary);
  settings.theme.uninstall = normalizeHex(rawTheme.uninstall, settings.theme.uninstall);
  settings.theme.deactivate = normalizeHex(rawTheme.deactivate, settings.theme.deactivate);
  settings.theme.conflict = normalizeHex(rawTheme.conflict, settings.theme.conflict);
  settings.theme.btnGimi = normalizeHex(rawTheme.btnGimi, settings.theme.btnGimi);
  settings.theme.btnGenshin = normalizeHex(rawTheme.btnGenshin, settings.theme.btnGenshin);
  settings.theme.btnGamebanana = normalizeHex(rawTheme.btnGamebanana, settings.theme.btnGamebanana);
  settings.theme.btnSettings = normalizeHex(rawTheme.btnSettings, settings.theme.btnSettings);

  const seen = new Set();
  const namesRaw = Array.isArray(raw.characterNames) ? raw.characterNames : [];
  for (const item of namesRaw) {
    const clean = normalizeWhitespace(item);
    if (!clean) continue;
    const canonical = normalizeWhitespace(clean.split("/")[0] || "");
    if (!canonical) continue;
    const key = normalizePersonNameForMatch(canonical);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    settings.characterNames.push(clean);
    if (settings.characterNames.length >= 400) break;
  }

  return settings;
}

function parseCharacterRuleLine(line) {
  const raw = normalizeWhitespace(line);
  if (!raw) return null;
  const parts = raw
    .split("/")
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);
  if (!parts.length) return null;
  const canonical = parts[0];
  const aliases = [];
  const seen = new Set();
  for (const part of parts) {
    const norm = normalizePersonNameForMatch(part);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    aliases.push(part);
  }
  if (!aliases.length) return null;
  return { canonical, aliases };
}

function normalizePortraitKey(value) {
  return normalizePersonNameForMatch(value).replace(/[^a-z0-9]/g, "");
}

function levenshteinDistance(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  const n = s.length;
  const m = t.length;
  if (!n) return m;
  if (!m) return n;
  const dp = Array.from({ length: n + 1 }, (_, i) => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[n][m];
}

async function listPortraitFiles() {
  if (!(await pathExists(CHAR_PORTRAIT_DIR))) return [];
  const entries = await fs.readdir(CHAR_PORTRAIT_DIR, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && ALLOWED_IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name);
}

function buildPortraitIndex(fileNames) {
  const index = new Map();
  for (const fileName of fileNames) {
    const base = path.parse(fileName).name;
    const key = normalizePortraitKey(base);
    if (!key || index.has(key)) continue;
    index.set(key, fileName);
  }
  return index;
}

function buildCharacterCandidates(characterName, settings) {
  const candidates = [];
  const seen = new Set();
  const push = (value) => {
    const raw = normalizeWhitespace(value);
    if (!raw) return;
    const key = raw.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(raw);
  };

  push(characterName);
  const needle = normalizePersonNameForMatch(characterName);
  const lines = Array.isArray(settings?.characterNames) ? settings.characterNames : [];
  for (const line of lines) {
    const rule = parseCharacterRuleLine(line);
    if (!rule) continue;
    const all = [rule.canonical, ...rule.aliases];
    const hasMatch = all.some((item) => normalizePersonNameForMatch(item) === needle);
    if (!hasMatch) continue;
    for (const item of all) push(item);
    break;
  }

  for (const value of candidates) {
    const tokens = value.split(/[\s-]+/).filter(Boolean);
    if (tokens.length > 1) {
      push(tokens[tokens.length - 1]);
      push(tokens.join(""));
    }
  }
  return candidates;
}

async function resolvePortraitFile(characterName) {
  const cleanName = normalizeWhitespace(characterName);
  if (!cleanName) return "";
  const settings = await readSettings();
  const files = await listPortraitFiles();
  if (!files.length) return "";
  const index = buildPortraitIndex(files);
  const candidates = buildCharacterCandidates(cleanName, settings);

  for (const candidate of candidates) {
    const key = normalizePortraitKey(candidate);
    if (index.has(key)) return index.get(key);
  }

  const candidateKeys = candidates.map(normalizePortraitKey).filter(Boolean);
  for (const key of candidateKeys) {
    if (!key) continue;
    for (const [portraitKey, fileName] of index.entries()) {
      if (portraitKey.endsWith(key) || key.endsWith(portraitKey)) {
        return fileName;
      }
    }
  }

  let best = { fileName: "", score: Infinity };
  for (const key of candidateKeys) {
    if (!key) continue;
    for (const [portraitKey, fileName] of index.entries()) {
      const dist = levenshteinDistance(key, portraitKey);
      const maxAllowed = key.length >= 8 ? 2 : 1;
      if (dist <= maxAllowed && dist < best.score) {
        best = { fileName, score: dist };
      }
    }
  }
  return best.fileName || "";
}

async function readSettings() {
  if (!(await pathExists(SETTINGS_PATH))) {
    return {
      ...DEFAULT_SETTINGS,
      paths: { ...DEFAULT_SETTINGS.paths },
      characterNames: [],
      theme: { ...DEFAULT_SETTINGS.theme },
    };
  }
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return sanitizeSettings(parsed);
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      paths: { ...DEFAULT_SETTINGS.paths },
      characterNames: [],
      theme: { ...DEFAULT_SETTINGS.theme },
    };
  }
}

async function writeSettings(input) {
  const safe = sanitizeSettings(input);
  await fs.writeFile(SETTINGS_PATH, `${JSON.stringify(safe, null, 2)}\n`, "utf-8");
  return safe;
}

function basePathByStateAndType(isActive, type) {
  const root = isActive ? MODS_DIR : DISABLE_DIR;
  if (type === "character") {
    return path.join(root, CHARACTERS_SUBDIR);
  }
  return root;
}

async function statSafe(fullPath) {
  try {
    return await fs.stat(fullPath);
  } catch {
    return null;
  }
}

async function pathExists(fullPath) {
  return (await statSafe(fullPath)) !== null;
}

function sanitizeArchiveName(fileName) {
  if (typeof fileName !== "string" || !fileName.trim()) {
    throw new Error("Nombre de archivo comprimido inválido.");
  }
  const base = path.basename(fileName.trim());
  const lower = base.toLowerCase();
  const ext =
    lower.endsWith(".tar.gz") ? ".tar.gz" : lower.endsWith(".tgz") ? ".tgz" : path.extname(lower);
  if (!ALLOWED_ARCHIVE_EXTENSIONS.has(ext)) {
    throw new Error("Formato no soportado. Usa zip/rar/7z/tar/tar.gz/tgz.");
  }
  const withoutExt = base.slice(0, base.length - ext.length).trim();
  if (!withoutExt) throw new Error("No se pudo obtener nombre del mod desde el comprimido.");
  const clean = withoutExt.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("Nombre de carpeta destino inválido.");
  return { baseFileName: base, modFolderName: clean, extension: ext };
}

async function runPowerShellCommand(command) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", (error) => reject(new Error(`Error ejecutando PowerShell: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        reject(new Error(`PowerShell devolvió código ${code}. ${output.trim()}`.trim()));
      }
    });
  });
}

function quotedPowerShellPath(filePath) {
  return `'${String(filePath).replace(/'/g, "''")}'`;
}

async function extractZipToDirectory(zipPath, outputDir) {
  const command = `Expand-Archive -LiteralPath ${quotedPowerShellPath(zipPath)} -DestinationPath ${quotedPowerShellPath(outputDir)} -Force`;
  await runPowerShellCommand(command);
}

async function extractArchiveWithTar(archivePath, outputDir) {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-xf", archivePath, "-C", outputDir], { windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", (error) => reject(new Error(`No se pudo ejecutar 'tar': ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Fallo al extraer archivo comprimido (código ${code}). ${output.trim()}`.trim()));
    });
  });
}

async function extractArchiveToDirectory(archivePath, outputDir, extension) {
  if (extension === ".zip") {
    await extractZipToDirectory(archivePath, outputDir);
    return;
  }
  await extractArchiveWithTar(archivePath, outputDir);
}

function isModDataFile(fileName) {
  return MOD_FILE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

async function installCharacterArchive({ archiveName, fileContentBase64 }) {
  if (typeof fileContentBase64 !== "string" || !fileContentBase64.trim()) throw new Error("Archivo comprimido vacío.");
  const archiveBuffer = Buffer.from(fileContentBase64, "base64");
  if (!archiveBuffer.length) throw new Error("No se pudo leer el contenido del .zip");
  return installCharacterArchiveFromBuffer({ archiveName, archiveBuffer });
}

async function installCharacterArchiveFromBuffer({ archiveName, archiveBuffer }) {
  const { modFolderName, extension } = sanitizeArchiveName(archiveName);
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gsmm-install-"));
  const archivePath = path.join(tmpRoot, `mod${extension}`);
  const extractPath = path.join(tmpRoot, "extracted");

  try {
    await fs.writeFile(archivePath, archiveBuffer);
    await fs.mkdir(extractPath, { recursive: true });
    await extractArchiveToDirectory(archivePath, extractPath, extension);

    const entries = await fs.readdir(extractPath, { withFileTypes: true });
    if (!entries.length) throw new Error("El .zip está vacío.");

    const hasDirectModFiles = entries.some((entry) => entry.isFile() && isModDataFile(entry.name));
    const dirs = entries.filter((entry) => entry.isDirectory());

    if (hasDirectModFiles) {
      const targetPath = path.join(MODS_DIR, CHARACTERS_SUBDIR, modFolderName);
      const targetDisabledPath = path.join(DISABLE_DIR, CHARACTERS_SUBDIR, modFolderName);
      if ((await pathExists(targetPath)) || (await pathExists(targetDisabledPath))) {
        throw new Error(`Ya existe un mod con ese nombre: ${modFolderName}`);
      }
      await fs.mkdir(targetPath, { recursive: false });
      for (const entry of entries) {
        await fs.cp(path.join(extractPath, entry.name), path.join(targetPath, entry.name), { recursive: true });
      }
      return { installedFolder: modFolderName, mode: "direct" };
    }

    if (dirs.length === 1) {
      const sourceFolderName = dirs[0].name;
      const targetPath = path.join(MODS_DIR, CHARACTERS_SUBDIR, sourceFolderName);
      const targetDisabledPath = path.join(DISABLE_DIR, CHARACTERS_SUBDIR, sourceFolderName);
      if ((await pathExists(targetPath)) || (await pathExists(targetDisabledPath))) {
        throw new Error(`Ya existe un mod con ese nombre: ${sourceFolderName}`);
      }
      await fs.cp(path.join(extractPath, sourceFolderName), targetPath, {
        recursive: true,
        force: false,
        errorOnExist: true,
      });
      return { installedFolder: sourceFolderName, mode: "single-folder" };
    }

    throw new Error(
      "No se pudo identificar el formato del mod. Debe tener archivos .dds/.ib/.buf en raíz o una sola carpeta principal."
    );
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}

async function parseMmInfo(modPath) {
  const jsonPath = path.join(modPath, "mminfo.json");
  const txtPath = path.join(modPath, "mminfo.txt");

  if (await pathExists(jsonPath)) {
    try {
      const raw = await fs.readFile(jsonPath, "utf-8");
      const data = JSON.parse(raw);
      if (data && typeof data === "object") {
        const out = {};
        for (const [key, value] of Object.entries(data)) {
          if (typeof value === "string") {
            out[normalizeMetaKey(key)] = value;
          }
        }
        return out;
      }
    } catch {
      return {};
    }
  }

  if (await pathExists(txtPath)) {
    try {
      const raw = await fs.readFile(txtPath, "utf-8");
      const result = {};
      for (const line of raw.split(/\r?\n/)) {
        const clean = line.trim();
        if (!clean || clean.startsWith("#")) continue;
        const idx = clean.indexOf(":");
        if (idx < 1) continue;
        const key = normalizeMetaKey(clean.slice(0, idx).trim());
        const value = clean.slice(idx + 1).trim();
        if (key && value) result[key] = value;
      }
      return result;
    } catch {
      return {};
    }
  }

  return {};
}

function normalizeModData({
  name,
  type,
  isActive,
  mmInfo,
}) {
  const forcedType = type;
  const typeFromMeta = pickMetaValue(mmInfo, ["type"]);
  const normalizedType =
    typeFromMeta === "character" || typeFromMeta === "general" ? typeFromMeta : forcedType;

  const title = pickMetaValue(mmInfo, ["title", "titulo", "name", "nombredelmod", "modtitle"]);
  const character = pickMetaValue(mmInfo, ["character", "personaje"]);
  const description = pickMetaValue(mmInfo, ["description", "descripcion", "notes", "note"]);
  const image = pickMetaValue(mmInfo, ["image", "imagen", "preview", "cover"]);
  return {
    id: `${normalizedType}|${name}`,
    folderName: name,
    title: title || name,
    type: normalizedType,
    character: character || (normalizedType === "character" ? "Sin definir" : null),
    description,
    image,
    isActive,
    hasMetadata: Object.keys(mmInfo).length > 0,
  };
}

async function scanOneBase(baseDir, type, isActive) {
  const entries = await fs.readdir(baseDir, { withFileTypes: true }).catch(() => []);
  const mods = [];

  for (const entry of entries) {
    if (entry.name === CHARACTERS_SUBDIR && type === "general") continue;
    if (!entry.isDirectory()) continue;
    if (type === "general" && GENERAL_IGNORED_FOLDERS.has(entry.name)) continue;

    const fullPath = path.join(baseDir, entry.name);
    const mmInfo = await parseMmInfo(fullPath);
    mods.push(
      normalizeModData({
        name: entry.name,
        type,
        isActive,
        mmInfo,
      })
    );
  }

  return mods;
}

async function scanAllMods() {
  const [generalActive, generalInactive, characterActive, characterInactive] = await Promise.all([
    scanOneBase(MODS_DIR, "general", true),
    scanOneBase(DISABLE_DIR, "general", false),
    scanOneBase(path.join(MODS_DIR, CHARACTERS_SUBDIR), "character", true),
    scanOneBase(path.join(DISABLE_DIR, CHARACTERS_SUBDIR), "character", false),
  ]);

  return [...generalActive, ...generalInactive, ...characterActive, ...characterInactive].sort((a, b) =>
    a.title.localeCompare(b.title, "es", { sensitivity: "base" })
  );
}

async function toggleMod({ folderName, type, isActive }) {
  const safeName = sanitizeEntryName(folderName);
  const safeType = normalizeType(type);
  const currentActive = Boolean(isActive);

  const sourceBase = basePathByStateAndType(currentActive, safeType);
  const targetBase = basePathByStateAndType(!currentActive, safeType);

  const sourcePath = path.join(sourceBase, safeName);
  const targetPath = path.join(targetBase, safeName);

  if (!(await pathExists(sourcePath))) {
    throw new Error("No existe el mod en la ubicación esperada.");
  }

  if (await pathExists(targetPath)) {
    throw new Error("Ya existe un mod con el mismo nombre en el destino.");
  }

  await fs.rename(sourcePath, targetPath);
}

async function resolveExistingModPath(type, folderName) {
  const safeType = normalizeType(type);
  const safeName = sanitizeEntryName(folderName);

  const activePath = path.join(basePathByStateAndType(true, safeType), safeName);
  const inactivePath = path.join(basePathByStateAndType(false, safeType), safeName);

  const activeExists = await pathExists(activePath);
  const inactiveExists = await pathExists(inactivePath);

  if (activeExists && inactiveExists) {
    throw new Error("El mod existe en Mods y Disable al mismo tiempo.");
  }
  if (!activeExists && !inactiveExists) {
    throw new Error("No se encontró el mod.");
  }

  return { modPath: activeExists ? activePath : inactivePath, isActive: activeExists };
}

async function saveCharacterMmInfo({
  folderName,
  type,
  title,
  character,
  description,
  image,
  imageFileName,
  imageContentBase64,
  imageFromUrl,
}) {
  const safeType = normalizeType(type);
  if (safeType !== "character") {
    throw new Error("mminfo editable solo para mods de personaje.");
  }

  const { modPath } = await resolveExistingModPath(safeType, folderName);
  let imageValue = (image || "").trim();
  if (imageFileName && imageContentBase64) {
    const safeImageName = path.basename(imageFileName.trim());
    const ext = path.extname(safeImageName).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
      throw new Error("Formato de imagen no permitido.");
    }
    const imageBuffer = Buffer.from(imageContentBase64, "base64");
    if (!imageBuffer.length) {
      throw new Error("La imagen seleccionada está vacía.");
    }
    await fs.writeFile(path.join(modPath, safeImageName), imageBuffer);
    imageValue = safeImageName;
  } else if (typeof imageFromUrl === "string" && imageFromUrl.trim()) {
    const imgUrl = new URL(imageFromUrl.trim());
    if (!["http:", "https:"].includes(imgUrl.protocol)) {
      throw new Error("URL de imagen inválida.");
    }
    const imageResponse = await fetch(imgUrl);
    if (!imageResponse.ok) {
      throw new Error(`No se pudo descargar imagen (${imageResponse.status}).`);
    }
    const contentType = (imageResponse.headers.get("content-type") || "").toLowerCase();
    const extMap = {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "image/bmp": ".bmp",
    };
    let ext = extMap[contentType.split(";")[0]] || "";
    if (!ext) {
      const fromPath = path.extname(imgUrl.pathname).toLowerCase();
      if (ALLOWED_IMAGE_EXTENSIONS.has(fromPath)) ext = fromPath;
    }
    if (!ext || !ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
      throw new Error("Formato de imagen web no soportado.");
    }
    const imageArray = await imageResponse.arrayBuffer();
    const imageBuffer = Buffer.from(imageArray);
    if (!imageBuffer.length) throw new Error("Imagen web vacía.");
    const downloadedName = `mminfo_image${ext}`;
    await fs.writeFile(path.join(modPath, downloadedName), imageBuffer);
    imageValue = downloadedName;
  }

  const mmInfoJsonPath = path.join(modPath, "mminfo.json");
  const mmInfo = {
    title: (title || "").trim(),
    character: (character || "").trim(),
    description: (description || "").trim(),
    image: imageValue,
    type: "character",
  };
  await fs.writeFile(mmInfoJsonPath, `${JSON.stringify(mmInfo, null, 2)}\n`, "utf-8");
}

function sanitizeFixFilename(fileName) {
  if (typeof fileName !== "string" || !fileName.trim()) {
    throw new Error("Nombre de archivo inválido.");
  }
  const safeName = path.basename(fileName.trim());
  const ext = path.extname(safeName).toLowerCase();
  if (!ALLOWED_FIX_EXTENSIONS.has(ext)) {
    throw new Error("Solo se permiten archivos .exe, .bat o .cmd.");
  }
  return safeName;
}

function getFixLibraryRoots() {
  const roots = [path.join(MODS_DIR, CHARACTERS_SUBDIR), path.join(MIGOTO_DIR, CHARACTERS_SUBDIR)];
  const unique = [];
  const seen = new Set();
  for (const root of roots) {
    const key = path.normalize(root).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(root);
  }
  return unique;
}

function buildFixId(fullPath) {
  return Buffer.from(fullPath, "utf-8").toString("base64url");
}

async function readFixInfoText() {
  for (const root of getFixLibraryRoots()) {
    const filePath = path.join(root, "FixInfo.txt");
    try {
      const content = await fs.readFile(filePath, "utf-8");
      if (content && content.trim()) {
        return content.trim();
      }
    } catch (error) {
      // ignore missing
    }
  }
  return "";
}

async function listFixLibrary() {
  const entries = [];
  for (const root of getFixLibraryRoots()) {
    const rootExists = await pathExists(root);
    if (!rootExists) continue;
    const dirEntries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of dirEntries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_FIX_EXTENSIONS.has(ext)) continue;
      const fullPath = path.join(root, entry.name);
      entries.push({
        id: buildFixId(fullPath),
        name: entry.name,
        location: root,
      });
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  return entries;
}

async function resolveFixById(fixId) {
  if (typeof fixId !== "string" || !fixId.trim()) {
    throw new Error("Fix inválido.");
  }
  const fixes = await listFixLibrary();
  const match = fixes.find((fix) => fix.id === fixId);
  if (!match) throw new Error("No se encontró el fix seleccionado.");
  return match;
}

async function executeFixInFolder({ executablePath, cwd }) {
  const ext = path.extname(executablePath).toLowerCase();
  if (process.platform === "win32") {
    const isExe = ext === ".exe";
    const args = isExe
      ? ["/c", "start", "", "/wait", executablePath]
      : ["/c", "start", "", "/wait", "cmd.exe", "/k", executablePath];

    return new Promise((resolve, reject) => {
      const child = spawn("cmd.exe", args, { cwd, windowsHide: false });
      child.on("error", (error) => reject(new Error(`No se pudo ejecutar el fix: ${error.message}`)));
      child.on("close", (code) => {
        if (code === 0) resolve("");
        else reject(new Error(`El fix terminó con código ${code}.`));
      });
    });
  }

  const command = ext === ".exe" ? executablePath : "cmd.exe";
  const args = ext === ".exe" ? [] : ["/c", executablePath];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: false });
    let output = "";

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.length > 5000) output = output.slice(-5000);
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
      if (output.length > 5000) output = output.slice(-5000);
    });

    child.on("error", (error) => reject(new Error(`No se pudo ejecutar el fix: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(`El fix terminó con código ${code}. ${output.trim()}`.trim()));
    });
  });
}

async function runFixForCharacterMod({ folderName, type, fileName, fileContentBase64 }) {
  const safeType = normalizeType(type);
  if (safeType !== "character") {
    throw new Error("Los arreglos solo aplican a mods de personaje.");
  }
  if (typeof fileContentBase64 !== "string" || !fileContentBase64.trim()) {
    throw new Error("Contenido del archivo vacío.");
  }

  const safeFile = sanitizeFixFilename(fileName);
  const { modPath } = await resolveExistingModPath(safeType, folderName);
  const executablePath = path.join(modPath, safeFile);

  const buffer = Buffer.from(fileContentBase64, "base64");
  if (!buffer.length) throw new Error("No se pudo leer el archivo seleccionado.");
  await fs.writeFile(executablePath, buffer);

  return executeFixInFolder({ executablePath, cwd: modPath });
}

async function runFixFromLibrary({ folderName, type, fixId }) {
  const safeType = normalizeType(type);
  if (safeType !== "character") {
    throw new Error("Los arreglos solo aplican a mods de personaje.");
  }
  const { modPath } = await resolveExistingModPath(safeType, folderName);
  const selectedFix = await resolveFixById(fixId);
  const safeFile = sanitizeFixFilename(selectedFix.name);
  const targetPath = path.join(modPath, safeFile);
  await fs.copyFile(path.join(selectedFix.location, safeFile), targetPath);
  return executeFixInFolder({ executablePath: targetPath, cwd: modPath });
}

async function uninstallMod({ folderName, type }) {
  const safeType = normalizeType(type);
  const safeName = sanitizeEntryName(folderName);
  const activePath = path.join(basePathByStateAndType(true, safeType), safeName);
  const inactivePath = path.join(basePathByStateAndType(false, safeType), safeName);

  const activeExists = await pathExists(activePath);
  const inactiveExists = await pathExists(inactivePath);
  if (!activeExists && !inactiveExists) {
    throw new Error("No se encontró el mod para desinstalar.");
  }

  if (activeExists) await fs.rm(activePath, { recursive: true, force: true });
  if (inactiveExists) await fs.rm(inactivePath, { recursive: true, force: true });
}

function safeSelector(value) {
  return typeof value === "string" ? value.trim() : "";
}

function extractTextBySelector($, selector) {
  if (!selector) return "";
  return $(selector).first().text().replace(/\s+/g, " ").trim();
}

function extractImageBySelector($, selector) {
  if (!selector) return "";
  const node = $(selector).first();
  if (!node.length) return "";
  return (node.attr("src") || node.attr("data-src") || node.attr("data-original") || "").trim();
}

async function fetchWebMetadata({ url, selectors = {} }) {
  if (typeof url !== "string" || !url.trim()) {
    throw new Error("URL inválida.");
  }
  const parsedUrl = new URL(url.trim());
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Solo se permiten URLs http/https.");
  }

  const response = await fetch(parsedUrl, {
    headers: {
      "User-Agent": "GenshinSuperModManager/0.1 (+metadata-fetch)",
    },
  });
  if (!response.ok) {
    throw new Error(`No se pudo abrir la URL (${response.status}).`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const titleSelector = safeSelector(selectors.title);
  const characterSelector = safeSelector(selectors.character);
  const descriptionSelector = safeSelector(selectors.description);
  const imageSelector = safeSelector(selectors.image);

  const title =
    extractTextBySelector($, titleSelector) ||
    $('meta[property="og:title"]').attr("content") ||
    $("title").first().text().trim() ||
    "";
  const character = extractTextBySelector($, characterSelector) || "";
  const description =
    extractTextBySelector($, descriptionSelector) ||
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    "";
  let imageUrl =
    extractImageBySelector($, imageSelector) ||
    $('meta[property="og:image"]').attr("content") ||
    "";

  if (imageUrl) {
    imageUrl = new URL(imageUrl, parsedUrl).toString();
  }

  return { title: title.trim(), character: character.trim(), description: description.trim(), imageUrl };
}

function normalizeRemoteName(value, fallback = "mod") {
  const base = path.basename((value || "").trim() || fallback);
  const clean = base.replace(/[<>:"/\\|?*]/g, "_").trim();
  return clean || fallback;
}

function getFileNameFromContentDisposition(disposition) {
  if (!disposition) return "";
  const star = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (star && star[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      return star[1];
    }
  }
  const plain = disposition.match(/filename="?([^";]+)"?/i);
  return plain && plain[1] ? plain[1] : "";
}

function toAbsoluteUrlIfPossible(value, baseUrl) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return "";
  }
}

function looksLikeDownloadUrl(url) {
  if (!url) return false;
  return /gamebanana\.com\/dl\/\d+/i.test(url) || /\.zip(\?|#|$)/i.test(url);
}

function looksLikeImageUrl(url) {
  if (!url) return false;
  return /\.(png|jpe?g|webp|gif|bmp)(\?|#|$)/i.test(url);
}

function looksLikeModGalleryImageUrl(url) {
  if (!url) return false;
  return /images\.gamebanana\.com\/img\/ss\/mods\//i.test(url);
}

function extractCharacterFromTitle(rawTitle, characterNames = []) {
  const source = normalizeWhitespace(rawTitle);
  if (!source || !Array.isArray(characterNames) || !characterNames.length) return { canonical: "", matchedAlias: "", aliases: [] };
  const sourceNorm = normalizePersonNameForMatch(source);
  let best = { canonical: "", matchedAlias: "", aliases: [], score: -1 };
  for (const line of characterNames) {
    const rule = parseCharacterRuleLine(line);
    if (!rule) continue;
    for (const alias of rule.aliases) {
      const norm = normalizePersonNameForMatch(alias);
      if (!norm) continue;
      const rx = new RegExp(`(^|[^a-z0-9])${escapeRegex(norm)}([^a-z0-9]|$)`, "i");
      if (!rx.test(sourceNorm)) continue;
      const score = norm.length;
      if (score > best.score) {
        best = {
          canonical: rule.canonical,
          matchedAlias: alias,
          aliases: rule.aliases,
          score,
        };
      }
    }
  }
  return {
    canonical: best.canonical,
    matchedAlias: best.matchedAlias,
    aliases: best.aliases,
  };
}

function sanitizeImportedTitle(rawTitle, detectedAliases = []) {
  let title = normalizeWhitespace(rawTitle);
  if (!title) return "";

  title = title
    .replace(/\s*-\s*A\s+Mod\s+for\s+Genshin\s+Impact\.?\s*$/i, "")
    .replace(/\bA\s+Mod\s+for\s+Genshin\s+Impact\.?\s*$/i, "");

  if (Array.isArray(detectedAliases) && detectedAliases.length) {
    for (const alias of detectedAliases) {
      const cleanAlias = normalizeWhitespace(alias);
      if (!cleanAlias) continue;
      const rx = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(cleanAlias)}([^\\p{L}\\p{N}]|$)`, "giu");
      title = title.replace(rx, " ");
    }
  }

  title = title
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\{[^}]*}/g, " ")
    .replace(/[【】〔〕「」『』《》]/g, " ")
    .replace(/[_|~`]+/g, " ")
    .replace(/[^\p{L}\p{N}\s\-!?:.,'"]/gu, " ")
    .replace(/\s*-\s*A\s+Mod\s+for\s+Genshin\s+Impact\.?\s*$/i, "")
    .replace(/\bA\s+Mod\s+for\s+Genshin\s+Impact\.?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return title;
}

async function normalizeImportedMetadata({ title, character, description }) {
  const settings = await readSettings();
  const detected = extractCharacterFromTitle(title, settings.characterNames);
  const aliasesToRemove = detected.aliases && detected.aliases.length ? detected.aliases : detected.matchedAlias ? [detected.matchedAlias] : [];
  const finalTitle = sanitizeImportedTitle(title, aliasesToRemove) || sanitizeImportedTitle(title) || normalizeWhitespace(title);
  const finalCharacter = normalizeWhitespace(character) || detected.canonical;
  return {
    title: finalTitle,
    character: finalCharacter,
    description: String(description || "").trim(),
  };
}

function extractFromUnknownJson(json, baseUrl) {
  const versions = [];
  const images = [];
  const versionsSeen = new Set();
  const imagesSeen = new Set();
  let title = "";
  let description = "";

  function pushVersion(name, url) {
    const abs = toAbsoluteUrlIfPossible(url, baseUrl);
    if (!abs || !looksLikeDownloadUrl(abs) || versionsSeen.has(abs)) return;
    versionsSeen.add(abs);
    const fallbackName = path.basename(new URL(abs).pathname) || "Archivo";
    versions.push({ name: (name || "").trim() || fallbackName, url: abs });
  }

  function pushImage(url) {
    const abs = toAbsoluteUrlIfPossible(url, baseUrl);
    if (!abs || !looksLikeImageUrl(abs) || imagesSeen.has(abs)) return;
    imagesSeen.add(abs);
    images.push(abs);
  }

  function walk(node, keyHint = "", parentObj = null) {
    if (node === null || node === undefined) return;
    if (typeof node === "string") {
      const value = node.trim();
      if (!value) return;
      if (!title && /name|title/i.test(keyHint) && value.length < 200) title = value;
      if (!description && /description|text|body|content/i.test(keyHint) && value.length > 40) description = value;
      const abs = toAbsoluteUrlIfPossible(value, baseUrl);
      if (looksLikeDownloadUrl(abs)) {
        const nearbyName =
          (parentObj &&
            (parentObj.name || parentObj.fileName || parentObj.filename || parentObj.title || parentObj._sFile || parentObj._sName)) ||
          "";
        pushVersion(String(nearbyName || ""), abs);
      }
      if (/download|fileid|idfile|file/i.test(keyHint) && /^\d{4,}$/.test(value)) {
        const nearbyName =
          (parentObj &&
            (parentObj.name || parentObj.fileName || parentObj.filename || parentObj.title || parentObj._sFile || parentObj._sName)) ||
          "";
        pushVersion(String(nearbyName || ""), `https://gamebanana.com/dl/${value}`);
      }
      if (looksLikeImageUrl(abs)) pushImage(abs);
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) walk(item, keyHint, parentObj);
      return;
    }

    if (typeof node === "object") {
      const obj = node;
      const directUrl =
        obj.url ||
        obj.downloadUrl ||
        obj.download_url ||
        obj.fileUrl ||
        obj.file_url ||
        obj._sDownloadUrl ||
        obj._sUrl ||
        obj._sDownload;
      const directName = obj.name || obj.fileName || obj.filename || obj.title || obj._sFile || obj._sName;
      if (directUrl) pushVersion(String(directName || ""), String(directUrl));
      if (obj._idRow && /^\d+$/.test(String(obj._idRow)) && (obj._sFile || /file/i.test(keyHint))) {
        pushVersion(String(directName || obj._sFile || ""), `https://gamebanana.com/dl/${obj._idRow}`);
      }

      const directImage = obj.image || obj.imageUrl || obj.thumb || obj.thumbnail || obj._sPreviewUrl || obj._sImage;
      if (directImage) pushImage(String(directImage));

      for (const [k, v] of Object.entries(obj)) {
        walk(v, k, obj);
      }
    }
  }

  walk(json);
  return { title, description, versions, images };
}

function extractFromHtmlRegex(html, baseUrl) {
  const versions = [];
  const images = [];
  const versionPairs = [];
  const versionsSeen = new Set();
  const imagesSeen = new Set();

  const pushVersion = (url, name = "") => {
    const abs = toAbsoluteUrlIfPossible(url, baseUrl);
    if (!abs || !looksLikeDownloadUrl(abs) || versionsSeen.has(abs)) return;
    versionsSeen.add(abs);
    const fallbackName = path.basename(new URL(abs).pathname) || "Archivo";
    const finalName = name || fallbackName;
    versions.push({ name: finalName, url: abs });
    if (versionPairs.length < 10) versionPairs.push(`${finalName} -> ${abs}`);
  };

  const pushImage = (url) => {
    const abs = toAbsoluteUrlIfPossible(url, baseUrl);
    if (!abs || !looksLikeImageUrl(abs) || imagesSeen.has(abs)) return;
    imagesSeen.add(abs);
    images.push(abs);
  };

  const normalized = html
    .replace(/\\u002f/gi, "/")
    .replace(/\\x2f/gi, "/")
    .replace(/\\\//g, "/");

  // Patrón específico GameBanana: empareja FileName + DownloadLink (como en tus ejemplos).
  const fileBlockRegex =
    /<li[^>]*class="[^"]*\bFile\b[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*\bFileName\b[^"]*"[^>]*>([^<]+)<\/span>[\s\S]*?<a[^>]*class="[^"]*\bDownloadLink\b[^"]*\bGreenColor\b[^"]*"[^>]*href="([^"]*gamebanana\.com\/dl\/\d+[^"]*)"/gi;
  let blockMatch;
  while ((blockMatch = fileBlockRegex.exec(normalized)) !== null) {
    pushVersion(blockMatch[2], (blockMatch[1] || "").trim());
  }

  const dlRegexes = [
    /https?:\/\/gamebanana\.com\/dl\/\d+/gi,
    /["'](\/dl\/\d+)["']/gi,
  ];
  for (const re of dlRegexes) {
    let m;
    while ((m = re.exec(normalized)) !== null) {
      pushVersion(m[1] || m[0]);
    }
  }

  const imageRegexes = [
    /https?:\/\/images\.gamebanana\.com\/img\/ss\/mods\/[^"'\\\s)]+/gi,
    /["'](\/img\/ss\/mods\/[^"'\\\s)]+\.(?:png|jpg|jpeg|webp|gif|bmp)[^"']*)["']/gi,
    // Captura nombres sueltos de preview que suelen venir en JSON embebido.
    /["']([a-f0-9]{10,}\.(?:png|jpg|jpeg|webp|gif|bmp))["']/gi,
  ];
  for (const re of imageRegexes) {
    let m;
    while ((m = re.exec(normalized)) !== null) {
      const raw = (m[1] || m[0] || "").trim();
      if (/^[a-f0-9]{10,}\.(?:png|jpg|jpeg|webp|gif|bmp)$/i.test(raw)) {
        pushImage(`https://images.gamebanana.com/img/ss/mods/${raw}`);
      } else {
        pushImage(raw);
      }
    }
  }

  // Captura thumbs tipo 530-90_xxx.jpg y los convierte en imagen completa xxx.jpg.
  const thumbRegex = /images\.gamebanana\.com\/img\/ss\/mods\/\d+-\d+_([a-z0-9]+\.(?:png|jpg|jpeg|webp|gif|bmp))/gi;
  let thumbMatch;
  while ((thumbMatch = thumbRegex.exec(normalized)) !== null) {
    pushImage(`https://images.gamebanana.com/img/ss/mods/${thumbMatch[1]}`);
  }

  return { versions, images, versionPairs };
}

async function fetchGameBananaApiData(modId) {
  const endpoints = [
    `https://api.gamebanana.com/Core/Item/Data?itemtype=Mod&itemid=${modId}&fields=*`,
    `https://api.gamebanana.com/Core/Item/Data?itemtype=Mod&itemid=${modId}&fields=name,Text(),Files(),Screenshots()`,
    `https://api.gamebanana.com/Core/Item/Data?itemtype=Mod&itemid=${modId}&fields=name,Files().aFiles()._idRow,Files().aFiles()._sFile,Files().aFiles()._sDownloadUrl,Screenshots().aRows()._sFile`,
  ];

  const debug = [];
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: { "User-Agent": "GenshinSuperModManager/0.1 (+gamebanana-api)" },
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        debug.push({ endpoint, ok: res.ok, status: res.status, parseJson: false, textLen: text.length });
        continue;
      }

      const extracted = extractFromUnknownJson(json, "https://gamebanana.com/");
      debug.push({
        endpoint,
        ok: res.ok,
        status: res.status,
        parseJson: true,
        versionsFound: extracted.versions.length,
        imagesFound: extracted.images.length,
      });
      if (res.ok && extracted.versions.length) {
        return { ok: true, data: extracted, debug };
      }
    } catch (error) {
      debug.push({ endpoint, error: error.message });
    }
  }

  return { ok: false, data: { title: "", description: "", versions: [], images: [] }, debug };
}

async function fetchGameBananaApiV10Data(modId) {
  const endpoints = [`https://gamebanana.com/apiv10/Mod/${modId}?_csvProperties=_sName,_sText,_aFiles,_aPreviewMedia`];

  const attempts = [];
  let best = { title: "", description: "", versions: [], images: [] };

  const addImageCandidateFactory = (images, seenImages) => (raw) => {
    if (!raw) return;
    const value = String(raw).trim();
    if (!value) return;
    let abs = "";

    if (/^[a-f0-9]{10,}\.(?:png|jpg|jpeg|webp|gif|bmp)$/i.test(value)) {
      abs = `https://images.gamebanana.com/img/ss/mods/${value}`;
    } else if (/^\d+-\d+_[a-f0-9]+\.(?:png|jpg|jpeg|webp|gif|bmp)$/i.test(value)) {
      abs = `https://images.gamebanana.com/img/ss/mods/${value.replace(/^\d+-\d+_/, "")}`;
    } else {
      abs = toAbsoluteUrlIfPossible(value, "https://images.gamebanana.com/");
    }
    if (!abs || !looksLikeImageUrl(abs) || !looksLikeModGalleryImageUrl(abs) || seenImages.has(abs)) return;
    seenImages.add(abs);
    images.push(abs);
  };

  for (const endpoint of endpoints) {
    const debug = { endpoint };
    try {
      const res = await fetch(endpoint, {
        headers: { ...browserLikeHeaders(), Accept: "application/json,text/plain,*/*" },
      });
      debug.status = res.status;
      const text = await res.text();
      debug.textLength = text.length;
      let json;
      try {
        json = JSON.parse(text);
        debug.parseJson = true;
      } catch {
        debug.parseJson = false;
        attempts.push(debug);
        continue;
      }

      debug.topLevelKeys = Object.keys(json || {}).slice(0, 40);
      debug.previewMediaType = Array.isArray(json._aPreviewMedia) ? "array" : typeof json._aPreviewMedia;
      debug.previewMediaLen = Array.isArray(json._aPreviewMedia) ? json._aPreviewMedia.length : 0;
      debug.previewMediaSample = Array.isArray(json._aPreviewMedia) && json._aPreviewMedia[0] ? json._aPreviewMedia[0] : null;
      debug.previewMediaKeys =
        json && json._aPreviewMedia && typeof json._aPreviewMedia === "object" && !Array.isArray(json._aPreviewMedia)
          ? Object.keys(json._aPreviewMedia).slice(0, 40)
          : [];
      debug.previewMediaSnippet =
        json && json._aPreviewMedia ? JSON.stringify(json._aPreviewMedia).slice(0, 1200) : "";
      debug.mediaType = Array.isArray(json._aMedia) ? "array" : typeof json._aMedia;
      debug.mediaLen = Array.isArray(json._aMedia) ? json._aMedia.length : 0;
      debug.mediaSample = Array.isArray(json._aMedia) && json._aMedia[0] ? json._aMedia[0] : null;
      debug.screenshotsType = Array.isArray(json._aScreenshots) ? "array" : typeof json._aScreenshots;
      debug.screenshotsLen = Array.isArray(json._aScreenshots) ? json._aScreenshots.length : 0;
      debug.screenshotsSample = Array.isArray(json._aScreenshots) && json._aScreenshots[0] ? json._aScreenshots[0] : null;

      const files = Array.isArray(json._aFiles) ? json._aFiles : [];
      const versions = [];
      const seenVersions = new Set();
      for (const file of files) {
        const name = String(file?._sFile || file?._sName || file?._sTitle || "").trim();
        const url = toAbsoluteUrlIfPossible(
          String(file?._sDownloadUrl || file?._sUrl || file?._sDownload || "").trim(),
          "https://gamebanana.com/"
        );
        if (!url || !looksLikeDownloadUrl(url) || seenVersions.has(url)) continue;
        seenVersions.add(url);
        versions.push({ name: name || path.basename(new URL(url).pathname) || "Archivo", url });
      }

      const mediaSources = [];
      if (json && json._aPreviewMedia) mediaSources.push(json._aPreviewMedia);
      if (Array.isArray(json._aMedia)) mediaSources.push(...json._aMedia);
      if (Array.isArray(json._aScreenshots)) mediaSources.push(...json._aScreenshots);
      const images = [];
      const seenImages = new Set();
      const addImageCandidate = addImageCandidateFactory(images, seenImages);
      const walkMediaNode = (node) => {
        if (node === null || node === undefined) return;
        if (typeof node === "string") {
          addImageCandidate(node);
          return;
        }
        if (Array.isArray(node)) {
          for (const item of node) walkMediaNode(item);
          return;
        }
        if (typeof node === "object") {
          for (const value of Object.values(node)) walkMediaNode(value);
        }
      };
      for (const item of mediaSources) walkMediaNode(item);

      if (!images.length) {
        const extracted = extractFromUnknownJson(json, "https://images.gamebanana.com/");
        for (const imageUrl of extracted.images) addImageCandidate(imageUrl);
      }

      const data = {
        title: typeof json._sName === "string" ? json._sName.trim() : "",
        description: typeof json._sText === "string" ? json._sText.replace(/\s+/g, " ").trim() : "",
        versions,
        images,
      };
      debug.versionsFound = versions.length;
      debug.imagesFound = images.length;
      debug.sampleVersion = versions[0] ? `${versions[0].name} -> ${versions[0].url}` : "";
      debug.sampleImage = images[0] || "";
      attempts.push(debug);

      if (versions.length && !best.versions.length) best = { ...best, title: data.title || best.title, description: data.description || best.description, versions };
      if (images.length && !best.images.length) best = { ...best, title: data.title || best.title, description: data.description || best.description, images };
    } catch (error) {
      debug.error = error.message;
      attempts.push(debug);
    }
  }

  return {
    ok: best.versions.length > 0 || best.images.length > 0,
    data: best,
    debug: {
      attempts,
      versionsFound: best.versions.length,
      imagesFound: best.images.length,
      sampleVersion: best.versions[0] ? `${best.versions[0].name} -> ${best.versions[0].url}` : "",
      sampleImage: best.images[0] || "",
    },
  };
}

async function fetchWebPageData({ url }) {
  if (typeof url !== "string" || !url.trim()) throw new Error("URL inválida.");
  const pageUrl = new URL(url.trim());
  if (!["http:", "https:"].includes(pageUrl.protocol)) throw new Error("Solo se permiten URLs http/https.");

  const response = await fetch(pageUrl, { headers: browserLikeHeaders() });
  if (!response.ok) throw new Error(`No se pudo abrir la página (${response.status}).`);
  let finalUrl = response.url || pageUrl.toString();
  let html = await response.text();
  const initialDebug = {
    requestedUrl: pageUrl.toString(),
    finalUrl,
    status: response.status,
    htmlLength: html.length,
    hasLiteralFilesModuleId: html.includes('id="FilesModule"'),
    hasLiteralModuleTag: html.includes("<module"),
    sampleFilesModuleSnippet:
      html.includes("FilesModule")
        ? html.slice(Math.max(0, html.indexOf("FilesModule") - 200), Math.min(html.length, html.indexOf("FilesModule") + 600))
        : "",
  };

  function parsePage(htmlText, baseUrl) {
    const $ = cheerio.load(htmlText);
    const title = $("h1#PageTitle").first().text().replace(/\s+/g, " ").trim();
    const descriptionHtml = ($("article.RichText").first().html() || "").trim();

    const versions = [];
    const seenVersionUrls = new Set();
    const filesModule = $("module#FilesModule, #FilesModule").first();

    const addVersion = (name, href) => {
      const cleanHref = (href || "").trim();
      if (!cleanHref) return;
      const absoluteUrl = new URL(cleanHref, baseUrl).toString();
      if (seenVersionUrls.has(absoluteUrl)) return;
      seenVersionUrls.add(absoluteUrl);
      versions.push({
        name: (name || "").replace(/\s+/g, " ").trim() || path.basename(new URL(absoluteUrl).pathname) || "Archivo",
        url: absoluteUrl,
      });
    };

    if (filesModule.length) {
      filesModule.find("li.File").each((_, li) => {
        const item = $(li);
        const name = item.find("span.FileName").first().text();
        let dl = item.find("a.DownloadLink.GreenColor[href]").first();
        if (!dl.length) dl = item.find("a.DownloadLink[href*='/dl/']").first();
        if (!dl.length) dl = item.find("a[href*='gamebanana.com/dl/']").first();
        addVersion(name, dl.attr("href"));
      });

      if (!versions.length) {
        filesModule.find("a.DownloadLink.GreenColor[href], a.DownloadLink[href*='/dl/'], a[href*='gamebanana.com/dl/']").each((_, a) => {
          const link = $(a);
          addVersion(link.text(), link.attr("href"));
        });
      }
    }

    const images = [];
    const seenImages = new Set();
    $(".Gallery a[href]").each((_, el) => {
      const href = ($(el).attr("href") || "").trim();
      if (!href) return;
      const absoluteUrl = new URL(href, baseUrl).toString();
      if (seenImages.has(absoluteUrl)) return;
      seenImages.add(absoluteUrl);
      images.push(absoluteUrl);
    });

    const debug = {
      hasFilesModule: filesModule.length > 0,
      fileItemsCount: filesModule.find("li.File").length,
      fileNameCount: filesModule.find(".FileName").length,
      greenDownloadCount: filesModule.find("a.DownloadLink.GreenColor[href]").length,
      anyDownloadCount: filesModule.find("a.DownloadLink[href]").length,
      dlHrefCount: filesModule.find("a[href*='/dl/'], a[href*='gamebanana.com/dl/']").length,
      firstFileName: filesModule.find(".FileName").first().text().replace(/\s+/g, " ").trim(),
      firstDownloadHref:
        (filesModule.find("a.DownloadLink.GreenColor[href]").first().attr("href") || "").trim() ||
        (filesModule.find("a.DownloadLink[href]").first().attr("href") || "").trim() ||
        (filesModule.find("a[href*='/dl/'], a[href*='gamebanana.com/dl/']").first().attr("href") || "").trim(),
    };

    return { title, description: descriptionHtml, versions, images, hasFilesModule: filesModule.length > 0, debug };
  }

  let parsed = parsePage(html, finalUrl);
  const debugSteps = [
    {
      step: "main",
      url: finalUrl,
      ...parsed.debug,
      versionsFound: parsed.versions.length,
      imagesFound: parsed.images.length,
      htmlLength: html.length,
    },
  ];

  if (!parsed.versions.length || !parsed.images.length) {
    const regexExtract = extractFromHtmlRegex(html, finalUrl);
    if (!parsed.versions.length && regexExtract.versions.length) parsed.versions = regexExtract.versions;
    if (!parsed.images.length && regexExtract.images.length) parsed.images = regexExtract.images;
    debugSteps.push({
      step: "regex-main",
      url: finalUrl,
      versionsFound: regexExtract.versions.length,
      imagesFound: regexExtract.images.length,
      sampleVersion: regexExtract.versions[0] ? regexExtract.versions[0].url : "",
      sampleImage: regexExtract.images[0] || "",
      samplePairs: regexExtract.versionPairs || [],
    });
  }

  // Fallback HTML para GameBanana cuando la página principal no trae la lista completa de archivos.
  if (!parsed.versions.length && pageUrl.hostname.toLowerCase().includes("gamebanana.com")) {
    const modIdMatch = finalUrl.match(/\/mods\/(\d+)/i) || pageUrl.pathname.match(/\/mods\/(\d+)/i);
    if (modIdMatch && modIdMatch[1]) {
      const fallbackUrl = `https://gamebanana.com/mods/download/${modIdMatch[1]}`;
      const fallbackRes = await fetch(fallbackUrl, { headers: browserLikeHeaders() });
      if (fallbackRes.ok) {
        const fallbackHtml = await fallbackRes.text();
        const fallbackParsed = parsePage(fallbackHtml, fallbackRes.url || fallbackUrl);
        const fallbackRegex = extractFromHtmlRegex(fallbackHtml, fallbackRes.url || fallbackUrl);
        if (fallbackParsed.versions.length) {
          debugSteps.push({
            step: "fallback",
            url: fallbackRes.url || fallbackUrl,
            ...fallbackParsed.debug,
            versionsFound: fallbackParsed.versions.length,
            imagesFound: fallbackParsed.images.length,
            htmlLength: fallbackHtml.length,
            hasLiteralFilesModuleId: fallbackHtml.includes('id="FilesModule"'),
            sampleFilesModuleSnippet:
              fallbackHtml.includes("FilesModule")
                ? fallbackHtml.slice(
                    Math.max(0, fallbackHtml.indexOf("FilesModule") - 200),
                    Math.min(fallbackHtml.length, fallbackHtml.indexOf("FilesModule") + 600)
                  )
                : "",
          });
          parsed = {
            title: parsed.title || fallbackParsed.title,
            description: parsed.description || fallbackParsed.description,
            versions: fallbackParsed.versions,
            images: parsed.images.length ? parsed.images : fallbackParsed.images,
            hasFilesModule: parsed.hasFilesModule || fallbackParsed.hasFilesModule,
            debug: fallbackParsed.debug,
          };
          finalUrl = fallbackRes.url || fallbackUrl;
        } else {
          debugSteps.push({
            step: "fallback",
            url: fallbackRes.url || fallbackUrl,
            ...fallbackParsed.debug,
            versionsFound: fallbackParsed.versions.length,
            imagesFound: fallbackParsed.images.length,
            htmlLength: fallbackHtml.length,
            hasLiteralFilesModuleId: fallbackHtml.includes('id="FilesModule"'),
            sampleFilesModuleSnippet:
              fallbackHtml.includes("FilesModule")
                ? fallbackHtml.slice(
                    Math.max(0, fallbackHtml.indexOf("FilesModule") - 200),
                    Math.min(fallbackHtml.length, fallbackHtml.indexOf("FilesModule") + 600)
                  )
                : "",
          });
        }
        if (!parsed.versions.length && fallbackRegex.versions.length) {
          parsed.versions = fallbackRegex.versions;
        }
        if (!parsed.images.length && fallbackRegex.images.length) {
          parsed.images = fallbackRegex.images;
        }
        debugSteps.push({
          step: "regex-fallback",
          url: fallbackRes.url || fallbackUrl,
          versionsFound: fallbackRegex.versions.length,
          imagesFound: fallbackRegex.images.length,
          sampleVersion: fallbackRegex.versions[0] ? fallbackRegex.versions[0].url : "",
          sampleImage: fallbackRegex.images[0] || "",
          samplePairs: fallbackRegex.versionPairs || [],
        });
      }
    }
  }

  // Fallback APIV10 de GameBanana (estructura estable con _aFiles/_aPreviewMedia).
  if (!parsed.versions.length && pageUrl.hostname.toLowerCase().includes("gamebanana.com")) {
    const modIdMatch = finalUrl.match(/\/mods\/(\d+)/i) || pageUrl.pathname.match(/\/mods\/(\d+)/i);
    if (modIdMatch && modIdMatch[1]) {
      const apiV10 = await fetchGameBananaApiV10Data(modIdMatch[1]);
      debugSteps.push({
        step: "api-v10",
        url: `https://gamebanana.com/apiv10/Mod/${modIdMatch[1]}`,
        versionsFound: apiV10.data.versions.length,
        imagesFound: apiV10.data.images.length,
        debug: apiV10.debug,
      });
      if (apiV10.ok && apiV10.data.versions.length) {
        parsed = {
          ...parsed,
          title: parsed.title || apiV10.data.title,
          description: parsed.description || apiV10.data.description,
          versions: apiV10.data.versions,
          images: parsed.images.length ? parsed.images : apiV10.data.images,
        };
      }
    }
  }

  // Fallback API para GameBanana cuando el scraping HTML queda vacío.
  if (!parsed.versions.length && pageUrl.hostname.toLowerCase().includes("gamebanana.com")) {
    const modIdMatch = finalUrl.match(/\/mods\/(\d+)/i) || pageUrl.pathname.match(/\/mods\/(\d+)/i);
    if (modIdMatch && modIdMatch[1]) {
      const apiResult = await fetchGameBananaApiData(modIdMatch[1]);
      debugSteps.push({
        step: "api",
        url: `https://api.gamebanana.com/...itemid=${modIdMatch[1]}`,
        hasFilesModule: false,
        fileItemsCount: 0,
        fileNameCount: 0,
        greenDownloadCount: 0,
        anyDownloadCount: 0,
        dlHrefCount: 0,
        firstFileName: "",
        firstDownloadHref: "",
        versionsFound: apiResult.data.versions.length,
        imagesFound: apiResult.data.images.length,
        apiDebug: apiResult.debug,
      });
      if (apiResult.ok && apiResult.data.versions.length) {
        parsed = {
          ...parsed,
          title: parsed.title || apiResult.data.title,
          description: parsed.description || apiResult.data.description,
          versions: apiResult.data.versions,
          images: parsed.images.length ? parsed.images : apiResult.data.images,
        };
      }
    }
  }

  if (parsed.images && parsed.images.length) {
    const scoreImage = (url) => {
      const lower = String(url).toLowerCase();
      if (lower.includes("/img/ss/mods/")) return 100;
      if (lower.includes("images.gamebanana.com/img/ss/")) return 80;
      if (lower.includes("images.gamebanana.com/img/")) return 60;
      if (looksLikeImageUrl(lower)) return 30;
      return 0;
    };
    parsed.images = [...parsed.images].sort((a, b) => scoreImage(b) - scoreImage(a));
  }
  if (parsed.images && parsed.images.length) {
    // Solo dejamos imágenes tipo galería de mod, para evitar backgrounds de perfil/web.
    parsed.images = parsed.images.filter((img) => looksLikeModGalleryImageUrl(img));
  }

  const normalizedMeta = await normalizeImportedMetadata({
    title: parsed.title,
    character: "",
    description: parsed.description,
  });

  return {
    pageUrl: finalUrl,
    title: normalizedMeta.title,
    character: normalizedMeta.character,
    description: normalizedMeta.description,
    versions: parsed.versions,
    images: parsed.images,
    debug: { initial: initialDebug, steps: debugSteps },
  };
}

async function importVersionFromWeb({
  pageUrl,
  fileUrl,
  fileName,
  title,
  character,
  description,
  imageUrl,
}) {
  if (typeof fileUrl !== "string" || !fileUrl.trim()) throw new Error("Falta link de descarga.");
  const absoluteFileUrl = new URL(fileUrl.trim(), pageUrl || undefined).toString();

  const response = await fetch(absoluteFileUrl, {
    headers: { "User-Agent": "GenshinSuperModManager/0.1 (+page-import)" },
  });
  if (!response.ok) throw new Error(`No se pudo descargar el archivo (${response.status}).`);

  const downloadedBuffer = Buffer.from(await response.arrayBuffer());
  if (!downloadedBuffer.length) throw new Error("El archivo descargado está vacío.");

  const contentDisposition = response.headers.get("content-disposition") || "";
  const cdName = getFileNameFromContentDisposition(contentDisposition);
  const urlName = path.basename(new URL(response.url || absoluteFileUrl).pathname || "");
  const labelName = normalizeRemoteName(fileName || "");
  let archiveName = cdName || urlName || labelName || "mod.zip";
  archiveName = normalizeRemoteName(archiveName, "mod.zip");

  const install = await installCharacterArchiveFromBuffer({
    archiveName,
    archiveBuffer: downloadedBuffer,
  });

  const normalizedMeta = await normalizeImportedMetadata({
    title: (title || "").trim() || install.installedFolder,
    character: (character || "").trim(),
    description: (description || "").trim(),
  });

  await saveCharacterMmInfo({
    folderName: install.installedFolder,
    type: "character",
    title: normalizedMeta.title || install.installedFolder,
    character: normalizedMeta.character,
    description: normalizedMeta.description,
    image: "",
    imageFromUrl: typeof imageUrl === "string" ? imageUrl.trim() : "",
  });

  return install;
}

function parseGameBananaModId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const direct = raw.match(/^\d+$/);
  if (direct) return direct[0];
  const fromUrl = raw.match(/\/mods\/(\d+)/i);
  return fromUrl && fromUrl[1] ? fromUrl[1] : "";
}

async function quickImportFromWeb({ url, modId, fileUrl, fileName }) {
  let pageUrl = String(url || "").trim();
  if (!pageUrl) {
    const id = parseGameBananaModId(modId);
    if (!id) throw new Error("Falta URL o modId válido.");
    pageUrl = `https://gamebanana.com/mods/${id}`;
  }

  const page = await fetchWebPageData({ url: pageUrl });
  let selectedVersion = null;
  if (typeof fileUrl === "string" && fileUrl.trim()) {
    const wanted = fileUrl.trim();
    selectedVersion = (page.versions || []).find((item) => item.url === wanted) || {
      name: (fileName || "").trim() || path.basename(new URL(wanted).pathname) || "archivo.zip",
      url: wanted,
    };
  } else {
    selectedVersion = (page.versions || [])[0] || null;
  }

  if (!selectedVersion || !selectedVersion.url) {
    throw new Error("No encontré archivos descargables para este mod.");
  }

  return importVersionFromWeb({
    pageUrl: page.pageUrl || pageUrl,
    fileUrl: selectedVersion.url,
    fileName: selectedVersion.name || fileName || "",
    title: page.title || "",
    character: page.character || "",
    description: page.description || "",
    imageUrl: (page.images && page.images[0]) || "",
  });
}

async function launchConfiguredTarget(target) {
  const safeTarget = String(target || "").trim().toLowerCase();
  if (!["gimi", "genshin"].includes(safeTarget)) {
    throw new Error("Target de lanzamiento inválido.");
  }
  const settings = await readSettings();
  const configuredPath = safeTarget === "gimi" ? settings.paths.gimi : settings.paths.genshin;
  if (!configuredPath) {
    throw new Error(`Configura primero la ruta de ${safeTarget === "gimi" ? "3DGIMI" : "Genshin Impact"} en Ajustes.`);
  }
  const normalizedPath = path.normalize(configuredPath);
  const stat = await statSafe(normalizedPath);
  if (!stat || !stat.isFile()) {
    throw new Error(`No existe el ejecutable configurado: ${configuredPath}`);
  }
  const ext = path.extname(normalizedPath).toLowerCase();

  const cwd = path.dirname(normalizedPath);
  const isStartFriendly = ext === ".exe" || ext === ".bat" || ext === ".cmd" || ext === ".lnk";

  const tryCmdStart = () =>
    new Promise((resolve, reject) => {
      const child = spawn("cmd.exe", ["/c", "start", "", normalizedPath], {
        cwd,
        windowsHide: false,
        detached: true,
        stdio: "ignore",
      });
      child.on("error", (error) => reject(error));
      child.on("spawn", () => {
        child.unref();
        resolve(true);
      });
    });

  const tryPowerShell = () =>
    new Promise((resolve, reject) => {
      const child = spawn(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `Start-Process -FilePath ${quotedPowerShellPath(normalizedPath)}`],
        {
          windowsHide: false,
          detached: true,
          stdio: "ignore",
        }
      );
      child.on("error", (error) => reject(error));
      child.on("spawn", () => {
        child.unref();
        resolve(true);
      });
    });

  try {
    if (isStartFriendly) {
      await tryCmdStart();
      return true;
    }
    await tryPowerShell();
    return true;
  } catch (error) {
    // Último fallback para rutas/juegos con restricciones de ejecución directa.
    try {
      await tryPowerShell();
      return true;
    } catch (error2) {
      throw new Error(`No se pudo iniciar: ${error2.message || error.message}`);
    }
  }
}

function ensureInside(parent, candidate) {
  const rel = path.relative(parent, candidate);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

async function serveModImage(req, res, url) {
  const folderName = sanitizeEntryName(url.searchParams.get("folderName") || "");
  const type = normalizeType(url.searchParams.get("type") || "");
  const imageParam = (url.searchParams.get("image") || "").trim();
  if (!imageParam) throw new Error("Falta parámetro image.");

  const { modPath } = await resolveExistingModPath(type, folderName);
  const imagePath = path.join(modPath, imageParam);
  if (!ensureInside(modPath, imagePath)) {
    throw new Error("Ruta de imagen insegura.");
  }
  if (!(await pathExists(imagePath))) {
    sendText(res, 404, "Imagen no encontrada");
    return true;
  }
  const stat = await fs.stat(imagePath);
  if (!stat.isFile()) {
    sendText(res, 404, "Imagen no válida");
    return true;
  }

  const content = await fs.readFile(imagePath);
  sendText(res, 200, content, guessContentType(imagePath));
  return true;
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/settings") {
    const settings = await readSettings();
    sendJson(res, 200, { ok: true, settings });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/settings") {
    const body = await readJsonBody(req);
    const settings = await writeSettings(body);
    sendJson(res, 200, { ok: true, settings });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/launch") {
    const body = await readJsonBody(req);
    await launchConfiguredTarget(body.target);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/open-3dmigoto-folder") {
    await openFolder(MIGOTO_DIR);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/exit") {
    sendJson(res, 200, { ok: true });
    requestExit();
    return true;
  }

  if (req.method === "GET" && pathname === "/api/characters/portrait") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const name = url.searchParams.get("name") || "";
    const fileName = await resolvePortraitFile(name);
    if (!fileName) {
      sendText(res, 404, "Portrait not found");
      return true;
    }
    const fullPath = path.join(CHAR_PORTRAIT_DIR, fileName);
    if (!(await pathExists(fullPath))) {
      sendText(res, 404, "Portrait not found");
      return true;
    }
    const content = await fs.readFile(fullPath);
    sendText(res, 200, content, guessContentType(fullPath));
    return true;
  }

  if (req.method === "GET" && pathname === "/api/mods") {
    const mods = await scanAllMods();
    sendJson(res, 200, { ok: true, mods });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/mods/image") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return await serveModImage(req, res, url);
  }

  if (req.method === "POST" && pathname === "/api/mods/toggle") {
    const body = await readJsonBody(req);
    await toggleMod(body);
    const mods = await scanAllMods();
    sendJson(res, 200, { ok: true, mods });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/mods/mminfo") {
    const body = await readJsonBody(req);
    await saveCharacterMmInfo(body);
    const mods = await scanAllMods();
    sendJson(res, 200, { ok: true, mods });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/mods/apply-fix") {
    const body = await readJsonBody(req);
    const output = await runFixForCharacterMod(body);
    const mods = await scanAllMods();
    sendJson(res, 200, { ok: true, output, mods });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/mods/fixes") {
    const fixes = await listFixLibrary();
    const info = await readFixInfoText();
    sendJson(res, 200, { ok: true, fixes, info });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/mods/apply-fix-library") {
    const body = await readJsonBody(req);
    const output = await runFixFromLibrary(body);
    const mods = await scanAllMods();
    sendJson(res, 200, { ok: true, output, mods });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/mods/install-character") {
    const body = await readJsonBody(req);
    const install = await installCharacterArchive(body);
    const mods = await scanAllMods();
    sendJson(res, 200, { ok: true, install, mods });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/mods/uninstall") {
    const body = await readJsonBody(req);
    await uninstallMod(body);
    const mods = await scanAllMods();
    sendJson(res, 200, { ok: true, mods });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/web/page-data") {
    const body = await readJsonBody(req);
    const page = await fetchWebPageData(body);
    sendJson(res, 200, { ok: true, page });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/web/import-version") {
    const body = await readJsonBody(req);
    const install = await importVersionFromWeb(body);
    const mods = await scanAllMods();
    sendJson(res, 200, { ok: true, install, mods });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/web/quick-import") {
    const body = await readJsonBody(req);
    const install = await quickImportFromWeb(body);
    const mods = await scanAllMods();
    sendJson(res, 200, { ok: true, install, mods });
    return true;
  }

  return false;
}

function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

async function handleStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const normalized = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(PUBLIC_DIR, normalized);

  if (!fullPath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  if (!fssync.existsSync(fullPath) || fssync.statSync(fullPath).isDirectory()) {
    sendText(res, 404, "Not Found");
    return;
  }

  const content = await fs.readFile(fullPath);
  sendText(res, 200, content, guessContentType(fullPath));
}

async function start() {
  await ensureBaseDirs();

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Content-Length": "0",
        });
        res.end();
        return;
      }
      const url = new URL(req.url, `http://${req.headers.host}`);
      const handledApi = await handleApi(req, res, url.pathname);
      if (handledApi) return;
      await handleStatic(req, res, url.pathname);
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message || "Error interno" });
    }
  });
  serverRef = server;

  server.listen(PORT, () => {
    console.log(`Mod Manager disponible en ${STARTUP_URL}`);
    openBrowser(STARTUP_URL);
  });
}

start().catch((error) => {
  console.error("No se pudo iniciar el servidor:", error);
  process.exit(1);
});
