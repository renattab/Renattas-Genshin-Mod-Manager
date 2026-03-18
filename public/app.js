const state = {
  mods: [],
  filter: "character",
  search: "",
  busyIds: new Set(),
  update: null,
  updateStatus: null,
  settings: {
    paths: { gimi: "", genshin: "" },
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
  },
};

const listEl = document.getElementById("list");
const summaryEl = document.getElementById("summary");
const searchInput = document.getElementById("searchInput");
const tabButtons = Array.from(document.querySelectorAll(".tab"));
const cardTemplate = document.getElementById("modCardTemplate");
const launch3dgimi = document.getElementById("launch3dgimi");
const launchGenshin = document.getElementById("launchGenshin");
const openGenshinModsWeb = document.getElementById("openGenshinModsWeb");
const openSettingsModal = document.getElementById("openSettingsModal");
const openMigotoFolder = document.getElementById("openMigotoFolder");

const isElectronHost = new URLSearchParams(window.location.search).has("rgmm");
if (!isElectronHost) {
if (!window.opener && window.name !== "rgmm_main") {
  const opened = window.open(window.location.href, "rgmm_main");
  if (opened) {
    opened.focus();
    window.close();
    } else {
      window.name = "rgmm_main";
    }
  } else if (window.name !== "rgmm_main") {
    window.name = "rgmm_main";
  }
} else if (window.name !== "rgmm_main") {
  window.name = "rgmm_main";
}

const openThemeFromSettings = document.getElementById("openThemeFromSettings");
const settingsModal = document.getElementById("settingsModal");
const settingsForm = document.getElementById("settingsForm");
const settings3dgimiPath = document.getElementById("settings3dgimiPath");
const pick3dmigotoFolder = document.getElementById("pick3dmigotoFolder");
const settingsGenshinPath = document.getElementById("settingsGenshinPath");
const settingsCharacterNames = document.getElementById("settingsCharacterNames");
const settingsHideEmptyCharacters = document.getElementById("settingsHideEmptyCharacters");
const settingsDisableAutoDeactivate = document.getElementById("settingsDisableAutoDeactivate");
const settingsThemePrimary = document.getElementById("settingsThemePrimary");
const settingsThemeUninstall = document.getElementById("settingsThemeUninstall");
const settingsThemeDeactivate = document.getElementById("settingsThemeDeactivate");
const settingsThemeConflict = document.getElementById("settingsThemeConflict");
const settingsThemeBtnGimi = document.getElementById("settingsThemeBtnGimi");
const settingsThemeBtnGenshin = document.getElementById("settingsThemeBtnGenshin");
const settingsThemeBtnGamebanana = document.getElementById("settingsThemeBtnGamebanana");
const settingsThemeBtnSettings = document.getElementById("settingsThemeBtnSettings");
const settingsThemeBtnOpenFolder = document.getElementById("settingsThemeBtnOpenFolder");
const settingsThemeBtnExit = document.getElementById("settingsThemeBtnExit");
const settingsCancel = document.getElementById("settingsCancel");
const themeModal = document.getElementById("themeModal");
const themeForm = document.getElementById("themeForm");
const themeCancel = document.getElementById("themeCancel");
const activeConflictBanner = document.getElementById("activeConflictBanner");
const updateBanner = document.getElementById("updateBanner");
const updateBannerText = document.getElementById("updateBannerText");
const updateBannerAction = document.getElementById("updateBannerAction");
const updateBannerStatus = document.getElementById("updateBannerStatus");
const updateBannerStatusText = document.getElementById("updateBannerStatusText");
const updateBannerProgressBar = document.getElementById("updateBannerProgressBar");
const characterDock = document.getElementById("characterDock");
const characterDockList = document.getElementById("characterDockList");
const mminfoModal = document.getElementById("mminfoModal");
const mminfoForm = document.getElementById("mminfoForm");
const mminfoTitle = document.getElementById("mminfoTitle");
const mminfoCharacter = document.getElementById("mminfoCharacter");
const mminfoDescription = document.getElementById("mminfoDescription");
const mminfoParent = document.getElementById("mminfoParent");
const mminfoImage = document.getElementById("mminfoImage");
const mminfoImageInfo = document.getElementById("mminfoImageInfo");
const mminfoCancel = document.getElementById("mminfoCancel");
const openInfoImportModal = document.getElementById("openInfoImportModal");
const infoImportModal = document.getElementById("infoImportModal");
const infoImportUrl = document.getElementById("infoImportUrl");
const infoImportCancel = document.getElementById("infoImportCancel");
const infoImportAnalyze = document.getElementById("infoImportAnalyze");
const infoImportResult = document.getElementById("infoImportResult");
const infoImportTitle = document.getElementById("infoImportTitle");
const infoImportDescription = document.getElementById("infoImportDescription");
const infoImportGallery = document.getElementById("infoImportGallery");
const infoImportClose = document.getElementById("infoImportClose");
const infoImportApply = document.getElementById("infoImportApply");
const fixPickerModal = document.getElementById("fixPickerModal");
const fixPickerTarget = document.getElementById("fixPickerTarget");
const fixPickerInfo = document.getElementById("fixPickerInfo");
const fixPickerList = document.getElementById("fixPickerList");
const fixPickerCancel = document.getElementById("fixPickerCancel");
const dropZone = document.getElementById("dropZone");
const zipInput = document.getElementById("zipInput");
const openImportModal = document.getElementById("openImportModal");
const importModal = document.getElementById("importModal");
const importUrl = document.getElementById("importUrl");
const importCancel = document.getElementById("importCancel");
const importAnalyze = document.getElementById("importAnalyze");
const importResult = document.getElementById("importResult");
const importTitle = document.getElementById("importTitle");
const importCharacter = document.getElementById("importCharacter");
const importDescription = document.getElementById("importDescription");
const importGallery = document.getElementById("importGallery");
const importVersions = document.getElementById("importVersions");
const importDebugOutput = document.getElementById("importDebugOutput");
let editingMod = null;
let mminfoImportedImageUrl = "";
let fixPickerMod = null;
let importState = {
  pageUrl: "",
  images: [],
  versions: [],
  selectedImageUrl: "",
};
let reopenMmInfoAfterInfoImport = false;
let infoImportDetectedCharacter = "";

function applyCharacterDockLayout() {
  if (!characterDock) return;
  const isCompact = window.innerWidth <= 980;
  characterDock.style.display = "grid";
  if (isCompact) {
    characterDock.style.position = "fixed";
    characterDock.style.left = "12px";
    characterDock.style.right = "12px";
    characterDock.style.bottom = "12px";
    characterDock.style.top = "auto";
    characterDock.style.width = "auto";
    characterDock.style.maxHeight = "30vh";
    characterDock.style.margin = "0";
  } else {
    characterDock.style.position = "";
    characterDock.style.left = "";
    characterDock.style.right = "";
    characterDock.style.bottom = "";
    characterDock.style.top = "";
    characterDock.style.width = "";
    characterDock.style.maxHeight = "";
    characterDock.style.margin = "";
  }
}

applyCharacterDockLayout();
window.addEventListener("resize", applyCharacterDockLayout);

function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const part = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...part);
  }
  return btoa(binary);
}

function openDialog(dialog, modal = true) {
  if (!dialog) return;
  if (typeof dialog.showModal === "function" && modal) {
    dialog.showModal();
    return;
  }
  if (typeof dialog.show === "function") {
    dialog.show();
  }
}

function normalizeTextKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseSearchQuery(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return { mode: "all", term: "" };
  if (trimmed.startsWith("!")) {
    return { mode: "character", term: trimmed.slice(1).trim() };
  }
  return { mode: "all", term: trimmed };
}

function formatCharacterSearch(name) {
  const clean = String(name || "").trim();
  return clean ? `!${clean}` : "!";
}

function normalizeHexColor(value, fallback) {
  const text = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
  return fallback;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const int = parseInt(clean, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function rgbToHex(r, g, b) {
  const to = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function mixHex(hexA, hexB, ratio) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const t = Math.max(0, Math.min(1, ratio));
  return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}

function getTheme() {
  const theme = state.settings?.theme || {};
  return {
    primary: normalizeHexColor(theme.primary, "#255ea4"),
    uninstall: normalizeHexColor(theme.uninstall, "#4a1f28"),
    deactivate: normalizeHexColor(theme.deactivate, "#d17b49"),
    conflict: normalizeHexColor(theme.conflict, "#875b2d"),
    btnGimi: normalizeHexColor(theme.btnGimi, "#2fbf71"),
    btnGenshin: normalizeHexColor(theme.btnGenshin, "#d17b49"),
    btnGamebanana: normalizeHexColor(theme.btnGamebanana, "#2a6de0"),
    btnSettings: normalizeHexColor(theme.btnSettings, "#6a4cc2"),
    btnOpenFolder: normalizeHexColor(theme.btnOpenFolder, "#6a4cc2"),
    btnExit: normalizeHexColor(theme.btnExit, "#4a1f28"),
  };
}

function applyTheme() {
  const theme = getTheme();
  const root = document.documentElement;
  const bg = mixHex(theme.primary, "#0a0f16", 0.9);
  const panel = mixHex(theme.primary, "#0f1720", 0.78);
  const panel2 = mixHex(theme.primary, "#0f1720", 0.68);
  const modalBg = mixHex(theme.primary, "#0e1a28", 0.74);
  const border = mixHex(theme.primary, "#9ab7d9", 0.42);
  const chip = mixHex(theme.primary, "#1a2a3d", 0.55);
  const surface1 = mixHex(theme.primary, "#0f1720", 0.82);
  const surface2 = mixHex(theme.primary, "#0f1720", 0.75);
  const surface3 = mixHex(theme.primary, "#0f1720", 0.72);
  const surface4 = mixHex(theme.primary, "#0f1720", 0.66);
  const tabBg = mixHex(theme.primary, "#141e2b", 0.44);
  const dropBg = mixHex(theme.primary, "#0f1720", 0.7);
  const secondaryBg = mixHex(theme.primary, "#101b29", 0.62);
  const dockBgSolid = mixHex(theme.primary, "#0e1a28", 0.66);
  const dockItemBg = mixHex(theme.primary, "#11263a", 0.6);
  const dockItemHover = mixHex(theme.primary, "#1b3a58", 0.62);
  const glow1 = mixHex(theme.primary, "#9bd0ff", 0.45);
  const glow2 = mixHex(theme.primary, "#7a5ca8", 0.33);
  const muted = mixHex(theme.primary, "#e2edff", 0.62);
  const ok = mixHex(theme.primary, "#2fbf71", 0.28);

  root.style.setProperty("--bg", bg);
  root.style.setProperty("--panel", panel);
  root.style.setProperty("--panel-2", panel2);
  root.style.setProperty("--modal-bg", modalBg);
  root.style.setProperty("--surface-1", surface1);
  root.style.setProperty("--surface-2", surface2);
  root.style.setProperty("--surface-3", surface3);
  root.style.setProperty("--surface-4", surface4);
  root.style.setProperty("--tab-bg", tabBg);
  root.style.setProperty("--dropzone-bg", dropBg);
  root.style.setProperty("--dropzone-border", mixHex(theme.primary, "#9ac7f5", 0.45));
  root.style.setProperty("--dropzone-bg-hover", mixHex(theme.primary, "#1f5a3e", 0.35));
  root.style.setProperty("--dropzone-border-hover", mixHex(theme.primary, "#8dd7ab", 0.36));
  root.style.setProperty("--secondary-bg", secondaryBg);
  root.style.setProperty("--dock-bg", dockBgSolid);
  root.style.setProperty("--dock-item-bg", dockItemBg);
  root.style.setProperty("--dock-item-hover", dockItemHover);
  root.style.setProperty("--dock-portrait-bg", mixHex(theme.primary, "#0b1623", 0.6));
  root.style.setProperty("--count-bg", mixHex(theme.primary, "#0f1f30", 0.55));
  root.style.setProperty("--border", border);
  root.style.setProperty("--chip", chip);
  root.style.setProperty("--bg-glow-1", glow1);
  root.style.setProperty("--bg-glow-2", glow2);
  root.style.setProperty("--muted", muted);
  root.style.setProperty("--ok", ok);
  root.style.setProperty("--theme-primary", theme.primary);
  root.style.setProperty("--uninstall-bg", theme.uninstall);
  root.style.setProperty("--uninstall-border", mixHex(theme.uninstall, "#ffffff", 0.25));
  root.style.setProperty("--off", theme.deactivate);
  root.style.setProperty("--conflict-border", theme.conflict);
  root.style.setProperty("--conflict-bg", mixHex(theme.conflict, "#000000", 0.55));
  root.style.setProperty("--conflict-text", mixHex(theme.conflict, "#ffffff", 0.72));
  root.style.setProperty("--dock-conflict-bg", mixHex(theme.conflict, "#000000", 0.48));
  root.style.setProperty("--dock-conflict-border", mixHex(theme.conflict, "#ffffff", 0.2));
  root.style.setProperty("--btn-gimi-bg", theme.btnGimi);
  root.style.setProperty("--btn-genshin-bg", theme.btnGenshin);
  root.style.setProperty("--btn-gamebanana-bg", theme.btnGamebanana);
  root.style.setProperty("--btn-settings-bg", theme.btnSettings);
  root.style.setProperty("--btn-openfolder-bg", theme.btnOpenFolder);
  root.style.setProperty("--btn-exit-bg", theme.btnExit);
}

function applyThemePreviewFromForm() {
  const root = document.documentElement;
  const primary = normalizeHexColor(settingsThemePrimary.value, "#255ea4");
  const uninstall = normalizeHexColor(settingsThemeUninstall.value, "#4a1f28");
  const deactivate = normalizeHexColor(settingsThemeDeactivate.value, "#d17b49");
  const conflict = normalizeHexColor(settingsThemeConflict.value, "#875b2d");
  const btnGimi = normalizeHexColor(settingsThemeBtnGimi.value, "#2fbf71");
  const btnGenshin = normalizeHexColor(settingsThemeBtnGenshin.value, "#d17b49");
  const btnGamebanana = normalizeHexColor(settingsThemeBtnGamebanana.value, "#2a6de0");
  const btnSettings = normalizeHexColor(settingsThemeBtnSettings.value, "#6a4cc2");
  const btnOpenFolder = normalizeHexColor(settingsThemeBtnOpenFolder.value, "#6a4cc2");
  const btnExit = normalizeHexColor(settingsThemeBtnExit.value, "#4a1f28");
  const bg = mixHex(primary, "#0a0f16", 0.9);
  const panel = mixHex(primary, "#0f1720", 0.78);
  const panel2 = mixHex(primary, "#0f1720", 0.68);
  const modalBg = mixHex(primary, "#0e1a28", 0.74);
  const border = mixHex(primary, "#9ab7d9", 0.42);
  const chip = mixHex(primary, "#1a2a3d", 0.55);
  const surface1 = mixHex(primary, "#0f1720", 0.82);
  const surface2 = mixHex(primary, "#0f1720", 0.75);
  const surface3 = mixHex(primary, "#0f1720", 0.72);
  const surface4 = mixHex(primary, "#0f1720", 0.66);
  const tabBg = mixHex(primary, "#141e2b", 0.44);
  const dropBg = mixHex(primary, "#0f1720", 0.7);
  const secondaryBg = mixHex(primary, "#101b29", 0.62);
  const dockBgSolid = mixHex(primary, "#0e1a28", 0.66);
  const dockItemBg = mixHex(primary, "#11263a", 0.6);
  const dockItemHover = mixHex(primary, "#1b3a58", 0.62);
  const glow1 = mixHex(primary, "#9bd0ff", 0.45);
  const glow2 = mixHex(primary, "#7a5ca8", 0.33);
  const muted = mixHex(primary, "#e2edff", 0.62);
  const ok = mixHex(primary, "#2fbf71", 0.28);

  root.style.setProperty("--bg", bg);
  root.style.setProperty("--panel", panel);
  root.style.setProperty("--panel-2", panel2);
  root.style.setProperty("--modal-bg", modalBg);
  root.style.setProperty("--surface-1", surface1);
  root.style.setProperty("--surface-2", surface2);
  root.style.setProperty("--surface-3", surface3);
  root.style.setProperty("--surface-4", surface4);
  root.style.setProperty("--tab-bg", tabBg);
  root.style.setProperty("--dropzone-bg", dropBg);
  root.style.setProperty("--dropzone-border", mixHex(primary, "#9ac7f5", 0.45));
  root.style.setProperty("--dropzone-bg-hover", mixHex(primary, "#1f5a3e", 0.35));
  root.style.setProperty("--dropzone-border-hover", mixHex(primary, "#8dd7ab", 0.36));
  root.style.setProperty("--secondary-bg", secondaryBg);
  root.style.setProperty("--dock-bg", dockBgSolid);
  root.style.setProperty("--dock-item-bg", dockItemBg);
  root.style.setProperty("--dock-item-hover", dockItemHover);
  root.style.setProperty("--dock-portrait-bg", mixHex(primary, "#0b1623", 0.6));
  root.style.setProperty("--count-bg", mixHex(primary, "#0f1f30", 0.55));
  root.style.setProperty("--border", border);
  root.style.setProperty("--chip", chip);
  root.style.setProperty("--bg-glow-1", glow1);
  root.style.setProperty("--bg-glow-2", glow2);
  root.style.setProperty("--muted", muted);
  root.style.setProperty("--ok", ok);
  root.style.setProperty("--theme-primary", primary);
  root.style.setProperty("--uninstall-bg", uninstall);
  root.style.setProperty("--uninstall-border", mixHex(uninstall, "#ffffff", 0.25));
  root.style.setProperty("--off", deactivate);
  root.style.setProperty("--conflict-border", conflict);
  root.style.setProperty("--conflict-bg", mixHex(conflict, "#000000", 0.55));
  root.style.setProperty("--conflict-text", mixHex(conflict, "#ffffff", 0.72));
  root.style.setProperty("--dock-conflict-bg", mixHex(conflict, "#000000", 0.48));
  root.style.setProperty("--dock-conflict-border", mixHex(conflict, "#ffffff", 0.2));
  root.style.setProperty("--btn-gimi-bg", btnGimi);
  root.style.setProperty("--btn-genshin-bg", btnGenshin);
  root.style.setProperty("--btn-gamebanana-bg", btnGamebanana);
  root.style.setProperty("--btn-settings-bg", btnSettings);
  root.style.setProperty("--btn-openfolder-bg", btnOpenFolder);
  root.style.setProperty("--btn-exit-bg", btnExit);
}

function fillSettingsForm() {
  settings3dgimiPath.value = state.settings?.paths?.gimi || "";
  settingsGenshinPath.value = state.settings?.paths?.genshin || "";
  settingsCharacterNames.value = (state.settings?.characterNames || []).join("\n");
  settingsHideEmptyCharacters.checked = Boolean(state.settings?.hideEmptyCharacters);
  settingsDisableAutoDeactivate.checked = Boolean(state.settings?.disableAutoDeactivate);
}

function fillThemeForm() {
  const theme = getTheme();
  settingsThemePrimary.value = theme.primary;
  settingsThemeUninstall.value = theme.uninstall;
  settingsThemeDeactivate.value = theme.deactivate;
  settingsThemeConflict.value = theme.conflict;
  settingsThemeBtnGimi.value = theme.btnGimi;
  settingsThemeBtnGenshin.value = theme.btnGenshin;
  settingsThemeBtnGamebanana.value = theme.btnGamebanana;
  settingsThemeBtnSettings.value = theme.btnSettings;
  settingsThemeBtnOpenFolder.value = theme.btnOpenFolder;
  settingsThemeBtnExit.value = theme.btnExit;
}

async function loadSettings() {
  const response = await fetch("/api/settings");
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "No se pudieron cargar los ajustes.");
  }
  state.settings = data.settings || state.settings;
  fillSettingsForm();
  fillThemeForm();
  applyTheme();
  renderCharacterDock();
}

async function saveSettings() {
  const characterNames = settingsCharacterNames.value
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
  const gimiBase = settings3dgimiPath.value.trim();
  if (gimiBase) {
    await ensureMigotoStructure(gimiBase);
  }
  const payload = {
    paths: {
      gimi: gimiBase,
      genshin: settingsGenshinPath.value.trim(),
    },
    characterNames,
    hideEmptyCharacters: settingsHideEmptyCharacters.checked,
    disableAutoDeactivate: settingsDisableAutoDeactivate.checked,
    theme: {
      primary: settingsThemePrimary.value,
      uninstall: settingsThemeUninstall.value,
      deactivate: settingsThemeDeactivate.value,
      conflict: settingsThemeConflict.value,
      btnGimi: settingsThemeBtnGimi.value,
      btnGenshin: settingsThemeBtnGenshin.value,
      btnGamebanana: settingsThemeBtnGamebanana.value,
      btnSettings: settingsThemeBtnSettings.value,
      btnOpenFolder: settingsThemeBtnOpenFolder.value,
      btnExit: settingsThemeBtnExit.value,
    },
  };
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "No se pudieron guardar los ajustes.");
  }
  state.settings = data.settings || state.settings;
  fillSettingsForm();
  fillThemeForm();
  applyTheme();
  renderCharacterDock();
  await loadMods();
}

async function saveThemeOnly() {
  const payload = {
    paths: state.settings?.paths || { gimi: "", genshin: "" },
    characterNames: state.settings?.characterNames || [],
    hideEmptyCharacters: Boolean(state.settings?.hideEmptyCharacters),
    disableAutoDeactivate: Boolean(state.settings?.disableAutoDeactivate),
    theme: {
      primary: settingsThemePrimary.value,
      uninstall: settingsThemeUninstall.value,
      deactivate: settingsThemeDeactivate.value,
      conflict: settingsThemeConflict.value,
      btnGimi: settingsThemeBtnGimi.value,
      btnGenshin: settingsThemeBtnGenshin.value,
      btnGamebanana: settingsThemeBtnGamebanana.value,
      btnSettings: settingsThemeBtnSettings.value,
      btnOpenFolder: settingsThemeBtnOpenFolder.value,
      btnExit: settingsThemeBtnExit.value,
    },
  };
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "No se pudo guardar el tema.");
  }
  state.settings = data.settings || state.settings;
  fillThemeForm();
  applyTheme();
}

async function ensureMigotoStructure(baseDir) {
  const validateResponse = await fetch("/api/paths/3dmigoto/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseDir }),
  });
  const validateData = await validateResponse.json().catch(() => ({}));
  if (!validateResponse.ok || validateData?.ok === false) {
    throw new Error(validateData.error || "No se pudo validar la carpeta de 3dmigoto.");
  }
  const missing = Array.isArray(validateData.missing) ? validateData.missing : [];
  if (!missing.length) return;
  const shortList = missing.map((item) => item.replace(baseDir, "").replace(/^[\\/]/, "")).join("\n");
  const confirmCreate = window.confirm(
    `Este 3DMigoto no está gestionado por RGMM.\n¿Quieres que se creen las carpetas necesarias para ser gestionado?\n\nCarpetas:\n${shortList}`
  );
  if (!confirmCreate) {
    throw new Error("Operación cancelada por el usuario.");
  }
  const ensureResponse = await fetch("/api/paths/3dmigoto/ensure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseDir }),
  });
  const ensureData = await ensureResponse.json().catch(() => ({}));
  if (!ensureResponse.ok || ensureData?.ok !== true) {
    throw new Error(ensureData.error || "No se pudieron crear las carpetas necesarias.");
  }
}

async function launchTarget(target) {
  const response = await fetch("/api/launch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "No se pudo iniciar la aplicación.");
  }
}

function canonicalCharacterName(line) {
  return String(line || "").split("/")[0].trim();
}

function setActiveFilter(filter) {
  state.filter = filter;
  for (const btn of tabButtons) {
    btn.classList.toggle("active", btn.dataset.filter === filter);
  }
}

function getCanonicalCharacterNames() {
  const lines = Array.isArray(state.settings?.characterNames) ? state.settings.characterNames : [];
  const names = [];
  const seen = new Set();
  for (const line of lines) {
    const canonical = canonicalCharacterName(line);
    if (!canonical) continue;
    const key = canonical.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(canonical);
  }
  names.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base", numeric: true }));
  return names;
}

function renderCharacterDock() {
  if (!characterDockList) return;
  characterDockList.innerHTML = "";
  const names = getCanonicalCharacterNames();
  if (!names.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "No hay personajes en Ajustes.";
    characterDockList.appendChild(p);
    return;
  }

  const installedCounts = new Map();
  const activeGroupCounts = new Map();
  const activeGroups = new Map();
  for (const mod of state.mods) {
    if (mod.type !== "character") continue;
    const key = normalizeTextKey(mod.character);
    if (!key) continue;
    installedCounts.set(key, (installedCounts.get(key) || 0) + 1);
    if (mod.isActive) {
      const groupId = mod.parent || mod.folderName;
      if (!activeGroups.has(key)) activeGroups.set(key, new Set());
      activeGroups.get(key).add(groupId);
      activeGroupCounts.set(key, activeGroups.get(key).size);
    }
  }

  for (const name of names) {
    const key = normalizeTextKey(name);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "character-dock-item";
    const count = installedCounts.get(key) || 0;
    const hasConflict = (activeGroupCounts.get(key) || 0) > 1;
    if (state.settings?.hideEmptyCharacters && count === 0) continue;
    if (hasConflict) row.classList.add("conflict");

    const img = document.createElement("img");
    img.className = "character-dock-portrait";
    img.alt = name;
    img.src = `/api/characters/portrait?name=${encodeURIComponent(name)}`;
    img.loading = "lazy";
    img.onerror = () => {
      img.src = "";
      img.style.visibility = "hidden";
    };

    const label = document.createElement("span");
    label.textContent = name;
    row.appendChild(img);
    row.appendChild(label);

    if (count > 0) {
      const countEl = document.createElement("span");
      countEl.className = "character-dock-count";
      countEl.textContent = String(count);
      row.appendChild(countEl);
      row.style.gridTemplateColumns = "30px 1fr auto";
    }
    row.addEventListener("click", () => {
      const searchValue = formatCharacterSearch(name);
      state.search = searchValue;
      searchInput.value = searchValue;
      setActiveFilter("character");
      render();
    });
    characterDockList.appendChild(row);
  }
}

function renderActiveConflictBanner() {
  if (!activeConflictBanner) return;
  const map = new Map();
  const displayNameByKey = new Map();
  for (const name of getCanonicalCharacterNames()) {
    const key = normalizeTextKey(name);
    if (key && !displayNameByKey.has(key)) displayNameByKey.set(key, name);
  }
  for (const mod of state.mods) {
    if (mod.type !== "character" || !mod.isActive) continue;
    const character = String(mod.character || "").trim();
    const key = normalizeTextKey(character);
    if (!key || character === "Sin definir") continue;
    if (!displayNameByKey.has(key)) displayNameByKey.set(key, character);
    const groupId = mod.parent || mod.folderName;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(groupId);
  }
  const conflicts = Array.from(map.entries())
    .filter(([, groups]) => groups.size > 1)
    .map(([key]) => displayNameByKey.get(key) || key)
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base", numeric: true }));

  if (!conflicts.length) {
    activeConflictBanner.hidden = true;
    activeConflictBanner.textContent = "";
    return;
  }

  activeConflictBanner.hidden = false;
  activeConflictBanner.textContent = `Hay más de un mod activado de: ${conflicts.join(", ")}`;
}

function renderUpdateBanner() {
  if (
    !updateBanner ||
    !updateBannerText ||
    !updateBannerAction ||
    !updateBannerStatus ||
    !updateBannerStatusText ||
    !updateBannerProgressBar
  ) return;
  const info = state.update;
  const status = state.updateStatus;
  const hasRealUpdate = Boolean(info?.hasUpdate && info?.downloadUrl);
  const hasRunningUpdate = Boolean(status?.running);
  const hasUpdateError = Boolean(status?.done && status?.ok === false && status?.error);
  const shouldShow = hasRealUpdate || hasRunningUpdate || hasUpdateError;
  if (!shouldShow) {
    updateBanner.hidden = true;
    updateBannerText.textContent = "";
    updateBannerStatus.hidden = true;
    updateBannerStatusText.textContent = "";
    updateBannerProgressBar.style.width = "0%";
    return;
  }

  updateBanner.hidden = false;
  updateBannerText.textContent = hasRealUpdate
    ? `Nueva versión disponible: ${info?.currentVersion || "sin versión"} ➜ ${info?.latestVersion || "?"}`
    : "Error al actualizar";
  updateBannerAction.disabled = !hasRealUpdate || hasRunningUpdate;
  updateBannerAction.hidden = !hasRealUpdate;
  updateBannerAction.textContent = hasRunningUpdate ? "Actualizando..." : "Descargar";

  const statusMessage = status?.error || status?.message || "";
  if (statusMessage) {
    updateBannerStatus.hidden = false;
    updateBannerStatusText.textContent = statusMessage;
    updateBannerProgressBar.style.width = `${Math.max(0, Math.min(100, status?.progress || 0))}%`;
  } else {
    updateBannerStatus.hidden = true;
    updateBannerStatusText.textContent = "";
    updateBannerProgressBar.style.width = "0%";
  }
}

let updateStatusTimer = null;

function ensureUpdateStatusPolling() {
  if (updateStatusTimer) return;
  updateStatusTimer = setInterval(loadUpdateStatus, 1000);
}

function stopUpdateStatusPolling() {
  if (!updateStatusTimer) return;
  clearInterval(updateStatusTimer);
  updateStatusTimer = null;
}

async function loadUpdateStatus() {
  try {
    const response = await fetch("/api/update-status");
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok !== true) return;
    state.updateStatus = data.status || null;
    if (state.updateStatus?.done && state.updateStatus?.ok && state.update) {
      state.update = {
        ...state.update,
        currentVersion: state.update.latestVersion || state.update.currentVersion,
        hasUpdate: false,
      };
    }
    renderUpdateBanner();
    if (state.updateStatus?.running) {
      ensureUpdateStatusPolling();
    } else {
      stopUpdateStatusPolling();
      if (state.updateStatus?.done && state.updateStatus?.ok) {
        await requestAppExit();
      }
    }
  } catch {
    // ignore
  }
}

async function loadUpdateInfo() {
  try {
    const response = await fetch("/api/update-check?force=1");
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok !== true) return;
    state.update = data;
    if (!state.update?.hasUpdate) {
      state.updateStatus = null;
    }
    renderUpdateBanner();
  } catch {
    // ignore update check failures to keep startup offline-friendly
  }
}

async function requestAppExit() {
  try {
    await fetch("/api/exit", { method: "POST" });
  } catch {
    window.close();
  }
}

async function startUpdateDownload() {
  try {
    const response = await fetch("/api/update-download", { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok !== true) {
      throw new Error(data.error || "No se pudo iniciar la actualización.");
    }
    state.updateStatus = data.status || null;
    renderUpdateBanner();
    ensureUpdateStatusPolling();
  } catch (error) {
    alert(error.message);
  }
}

function getFilteredMods() {
  const { mode, term } = parseSearchQuery(state.search);
  const query = term.toLowerCase();
  const characterQueryKey = mode === "character" ? normalizeTextKey(term) : "";
  const filtered = state.mods.filter((mod) => {
    if (state.filter === "general" && mod.type !== "general") return false;
    if (state.filter === "character" && mod.type !== "character") return false;
    if (state.filter === "active" && !mod.isActive) return false;
    if (state.filter === "inactive" && mod.isActive) return false;

    if (!query) return true;
    if (mode === "character") {
      if (mod.type !== "character") return false;
      const characterKey = normalizeTextKey(mod.character || "");
      return Boolean(characterKey && characterKey.includes(characterQueryKey));
    }
    const text = [mod.title, mod.folderName, mod.character || "", mod.description || ""].join(" ").toLowerCase();
    return text.includes(query);
  });

  const key = (mod) => {
    if (mod.type === "character") return (mod.character || mod.title || mod.folderName || "").trim();
    return `~~~${(mod.title || mod.folderName || "").trim()}`;
  };

  filtered.sort((a, b) => {
    const byCharacter = key(a).localeCompare(key(b), "es", { sensitivity: "base", numeric: true });
    if (byCharacter !== 0) return byCharacter;
    return (a.title || a.folderName || "").localeCompare(b.title || b.folderName || "", "es", {
      sensitivity: "base",
      numeric: true,
    });
  });

  return filtered;
}

function badge(label, className = "") {
  const span = document.createElement("span");
  span.className = `badge ${className}`.trim();
  span.textContent = label;
  return span;
}

function stripHtml(html) {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  return (temp.textContent || temp.innerText || "").replace(/\s+/g, " ").trim();
}

async function toggleMod(mod) {
  if (state.busyIds.has(mod.id)) return;
  state.busyIds.add(mod.id);
  render();

  try {
    const response = await fetch("/api/mods/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        folderName: mod.folderName,
        type: mod.type,
        isActive: mod.isActive,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "No se pudo cambiar el estado del mod.");
    }
    state.mods = data.mods;
  } catch (error) {
    alert(error.message);
  } finally {
    state.busyIds.delete(mod.id);
    render();
  }
}

function openMmInfoModal(mod) {
  editingMod = mod;
  mminfoImportedImageUrl = "";
  mminfoTitle.value = mod.title || "";
  mminfoCharacter.value = mod.character === "Sin definir" ? "" : mod.character || "";
  mminfoDescription.value = mod.description || "";
  fillMmInfoParentOptions(mod);
  mminfoImage.value = "";
  mminfoImageInfo.textContent = mod.image ? `Imagen actual: ${mod.image}` : "Sin imagen actual.";
  openDialog(mminfoModal, true);
}

function fillMmInfoParentOptions(mod) {
  if (!mminfoParent) return;
  mminfoParent.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Ninguno";
  mminfoParent.appendChild(empty);
  const characterKey = normalizeTextKey(mod.character || "");
  const candidates = state.mods.filter(
    (item) =>
      item.type === "character" &&
      item.folderName !== mod.folderName &&
      normalizeTextKey(item.character || "") === characterKey
  );
  for (const item of candidates) {
    const opt = document.createElement("option");
    opt.value = item.folderName;
    opt.textContent = `${item.title || item.folderName} (${item.folderName})`;
    mminfoParent.appendChild(opt);
  }
  mminfoParent.value = mod.parent || "";
}

function resetInfoImportModal() {
  infoImportUrl.value = "";
  infoImportTitle.value = "";
  infoImportDescription.value = "";
  infoImportGallery.innerHTML = "";
  infoImportResult.hidden = true;
  infoImportModal.dataset.selectedImage = "";
  infoImportDetectedCharacter = "";
}

function renderInfoImportGallery(images) {
  infoImportGallery.innerHTML = "";
  const selected = infoImportModal.dataset.selectedImage || "";
  for (const imageUrl of images) {
    const item = document.createElement("div");
    item.className = "import-thumb";
    if (selected === imageUrl) item.classList.add("selected");
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = "Imagen del mod";
    item.appendChild(img);
    item.addEventListener("click", () => {
      infoImportModal.dataset.selectedImage = imageUrl;
      renderInfoImportGallery(images);
    });
    infoImportGallery.appendChild(item);
  }
}

async function analyzeInfoImportUrl() {
  const url = infoImportUrl.value.trim();
  if (!url) {
    alert("Pega una URL primero.");
    return;
  }
  try {
    const response = await fetch("/api/web/page-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "No se pudo analizar el enlace.");
    }
    const page = data.page || {};
    const images = Array.isArray(page.images) ? page.images : [];
    infoImportTitle.value = page.title || "";
    infoImportDescription.value = page.description || "";
    infoImportDetectedCharacter = page.character || "";
    infoImportModal.dataset.selectedImage = images[0] || "";
    renderInfoImportGallery(images);
    infoImportResult.hidden = false;
  } catch (error) {
    alert(error.message);
  }
}

function applyInfoImportToMmInfo() {
  mminfoTitle.value = infoImportTitle.value.trim();
  mminfoDescription.value = infoImportDescription.value;
  if (infoImportDetectedCharacter) {
    mminfoCharacter.value = infoImportDetectedCharacter;
  }
  mminfoImportedImageUrl = infoImportModal.dataset.selectedImage || "";
  if (mminfoImportedImageUrl) {
    mminfoImageInfo.textContent = `Imagen desde enlace: ${mminfoImportedImageUrl}`;
    mminfoImage.value = "";
  }
  infoImportModal.close();
  resetInfoImportModal();
  if (reopenMmInfoAfterInfoImport) {
    reopenMmInfoAfterInfoImport = false;
    openDialog(mminfoModal, true);
  }
}

async function saveMmInfo() {
  if (!editingMod) return;
  const selectedImage = mminfoImage.files && mminfoImage.files[0];
  let imagePayload = {};

  if (selectedImage) {
    imagePayload = {
      imageFileName: selectedImage.name,
      imageContentBase64: arrayBufferToBase64(await selectedImage.arrayBuffer()),
    };
  }

  try {
    const response = await fetch("/api/mods/mminfo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        folderName: editingMod.folderName,
        type: editingMod.type,
        title: mminfoTitle.value.trim(),
        character: mminfoCharacter.value.trim(),
        description: mminfoDescription.value.trim(),
        parent: mminfoParent ? mminfoParent.value.trim() : "",
        image: editingMod.image || "",
        imageFromUrl: selectedImage ? "" : mminfoImportedImageUrl,
        ...imagePayload,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "No se pudo guardar mminfo.");
    }
    state.mods = data.mods;
    mminfoModal.close();
    editingMod = null;
    mminfoImportedImageUrl = "";
    render();
  } catch (error) {
    alert(error.message);
  }
}

async function applyFixFile(mod, file) {
  if (!file) return;
  const fileName = file.name || "";
  const extension = fileName.toLowerCase().split(".").pop();
  if (!["exe", "bat", "cmd"].includes(extension)) {
    alert("Solo se permiten archivos .exe, .bat o .cmd");
    return;
  }

  const base64 = arrayBufferToBase64(await file.arrayBuffer());

  try {
    const response = await fetch("/api/mods/apply-fix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        folderName: mod.folderName,
        type: mod.type,
        fileName,
        fileContentBase64: base64,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "No se pudo aplicar el fix.");
    }
    state.mods = data.mods;
    render();
  } catch (error) {
    alert(error.message);
  }
}

async function openFixPicker(mod) {
  fixPickerMod = mod;
  fixPickerTarget.textContent = `Mod: ${mod.title}`;
  fixPickerInfo.textContent = "";
  fixPickerInfo.hidden = true;
  fixPickerList.innerHTML = "<p class='meta'>Cargando fixes...</p>";
  fixPickerModal.showModal();

  try {
    const response = await fetch("/api/mods/fixes");
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "No se pudo cargar la lista de fixes.");
    }
    const fixes = Array.isArray(data.fixes) ? data.fixes : [];
    const info = typeof data.info === "string" ? data.info.trim() : "";
    if (info) {
      fixPickerInfo.textContent = info;
      fixPickerInfo.hidden = false;
    }
    fixPickerList.innerHTML = "";
    if (!fixes.length) {
      fixPickerList.innerHTML = "<p class='meta'>No se encontraron .exe/.bat/.cmd en la carpeta de personajes.</p>";
      return;
    }

    for (const fix of fixes) {
      const row = document.createElement("div");
      row.className = "version-row";
      const label = document.createElement("span");
      label.textContent = fix.displayName || fix.name;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "secondary-btn";
      btn.textContent = "Aplicar";
      btn.addEventListener("click", () => applyFixFromLibrary(fix.id));
      row.appendChild(label);
      row.appendChild(btn);
      fixPickerList.appendChild(row);
    }
  } catch (error) {
    fixPickerList.innerHTML = "";
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = error.message;
    fixPickerList.appendChild(p);
  }
}

async function applyFixFromLibrary(fixId) {
  if (!fixPickerMod) return;
  try {
    const response = await fetch("/api/mods/apply-fix-library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        folderName: fixPickerMod.folderName,
        type: fixPickerMod.type,
        fixId,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "No se pudo aplicar el fix.");
    }
    state.mods = data.mods;
    render();
    fixPickerModal.close();
    fixPickerMod = null;
  } catch (error) {
    alert(error.message);
  }
}

async function installCharacterArchive(file) {
  if (!file) return;
  const lower = (file.name || "").toLowerCase();
  const allowed = [".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".tar.gz"];
  const ok = allowed.some((ext) => lower.endsWith(ext));
  if (!ok) {
    alert("Formato no soportado. Usa zip/rar/7z/tar/tar.gz/tgz.");
    return;
  }

  try {
    const response = await fetch("/api/mods/install-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        archiveName: file.name,
        fileContentBase64: arrayBufferToBase64(await file.arrayBuffer()),
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "No se pudo instalar el mod.");
    }
    state.mods = data.mods;
    render();
    alert(`Mod instalado: ${data.install.installedFolder}`);
  } catch (error) {
    alert(error.message);
  }
}

async function uninstallMod(mod) {
  const confirmed = confirm(`Vas a desinstalar "${mod.title}".\nSe borrará del disco de forma permanente.\n\n¿Continuar?`);
  if (!confirmed) return;

  try {
    const response = await fetch("/api/mods/uninstall", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        folderName: mod.folderName,
        type: mod.type,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "No se pudo desinstalar el mod.");
    }
    state.mods = data.mods;
    render();
  } catch (error) {
    alert(error.message);
  }
}

function resetImportModal() {
  importState = { pageUrl: "", images: [], versions: [], selectedImageUrl: "" };
  importUrl.value = "";
  importTitle.value = "";
  importCharacter.value = "";
  importDescription.value = "";
  importResult.hidden = true;
  importGallery.innerHTML = "";
  importVersions.innerHTML = "";
  importDebugOutput.value = "";
}

function renderImportGallery() {
  importGallery.innerHTML = "";
  for (const imageUrl of importState.images) {
    const item = document.createElement("div");
    item.className = "import-thumb";
    if (importState.selectedImageUrl === imageUrl) item.classList.add("selected");
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = "Thumbnail";
    item.appendChild(img);
    item.addEventListener("click", () => {
      importState.selectedImageUrl = imageUrl;
      renderImportGallery();
    });
    importGallery.appendChild(item);
  }
}

async function importVersion(versionItem) {
  try {
    const response = await fetch("/api/web/import-version", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageUrl: importState.pageUrl,
        fileUrl: versionItem.url,
        fileName: versionItem.name,
        title: importTitle.value.trim(),
        character: importCharacter.value.trim(),
        description: importDescription.value.trim(),
        imageUrl: importState.selectedImageUrl,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "No se pudo importar esta versión.");
    }
    state.mods = data.mods;
    render();
    importModal.close();
    resetImportModal();
    alert(`Mod importado: ${data.install.installedFolder}`);
  } catch (error) {
    alert(error.message);
  }
}

function renderImportVersions() {
  importVersions.innerHTML = "";
  for (const versionItem of importState.versions) {
    const row = document.createElement("div");
    row.className = "version-row";
    const text = document.createElement("span");
    text.textContent = versionItem.name || "Archivo";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "secondary-btn";
    btn.textContent = "Descargar e importar";
    btn.addEventListener("click", () => importVersion(versionItem));
    row.appendChild(text);
    row.appendChild(btn);
    importVersions.appendChild(row);
  }
}

async function analyzeImportUrl() {
  const url = importUrl.value.trim();
  if (!url) {
    alert("Pega una URL primero.");
    return;
  }
  try {
    const response = await fetch("/api/web/page-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "No se pudo analizar la página.");
    }
    importState.pageUrl = data.page.pageUrl || url;
    importState.images = data.page.images || [];
    importState.versions = data.page.versions || [];
    importState.selectedImageUrl = importState.images[0] || "";
    importTitle.value = data.page.title || "";
    importDescription.value = data.page.description || "";
    importCharacter.value = data.page.character || "";
    renderImportGallery();
    renderImportVersions();
    importDebugOutput.value = JSON.stringify(data.page.debug || {}, null, 2);
    importResult.hidden = false;
    if (!importState.versions.length) {
      alert("No encontré archivos descargables en FilesModule. Abre 'Debug análisis' y pásame ese output.");
    }
  } catch (error) {
    alert(error.message);
  }
}

function render() {
  renderActiveConflictBanner();
  renderCharacterDock();
  const mods = getFilteredMods();
  const activeCount = state.mods.filter((m) => m.isActive).length;
  summaryEl.textContent = `Total: ${state.mods.length} | Activos: ${activeCount} | Mostrando: ${mods.length}`;

  listEl.innerHTML = "";
  if (mods.length === 0) {
    const empty = document.createElement("p");
    empty.className = "meta";
    empty.textContent = "No hay mods para este filtro.";
    listEl.appendChild(empty);
    return;
  }

  for (const mod of mods) {
    const fragment = cardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".mod-card");
    const nameEl = fragment.querySelector(".mod-name");
    const charEl = fragment.querySelector(".mod-character");
    const badgesEl = fragment.querySelector(".badges");
    const imageEl = fragment.querySelector(".mod-image");
    const folderEl = fragment.querySelector(".folder-name");
    const metaEl = fragment.querySelector(".meta");
    const descriptionEl = fragment.querySelector(".description");
    const descriptionFullEl = fragment.querySelector(".description-full");
    const readMoreBtn = fragment.querySelector(".read-more-btn");
    const mminfoBtn = fragment.querySelector(".mminfo-btn");
    const fixBtn = fragment.querySelector(".fix-btn");
    const uninstallBtn = fragment.querySelector(".uninstall-btn");
    const btn = fragment.querySelector(".toggle-btn");

    nameEl.textContent = mod.title;
    charEl.textContent = mod.type === "character" ? mod.character || "Sin definir" : "";
    if (mod.type !== "character") charEl.style.display = "none";
    folderEl.textContent = `Carpeta: ${mod.folderName}`;

    badgesEl.appendChild(badge(mod.type === "character" ? "Personaje" : "General"));
    badgesEl.appendChild(badge(mod.isActive ? "Activo" : "Inactivo", mod.isActive ? "active" : "inactive"));
    if (mod.hasMetadata) {
      badgesEl.appendChild(badge("mminfo"));
    }

    metaEl.textContent = mod.type === "character" ? "Mod de personaje" : "Mod general";

    const rawDescription = mod.description || "";
    const hasHtml = /<[^>]+>/.test(rawDescription);
    const plainDescription = hasHtml ? stripHtml(rawDescription) : rawDescription;
    const previewMax = 170;
    const shortPreview =
      plainDescription.length > previewMax ? `${plainDescription.slice(0, previewMax).trim()}...` : plainDescription;
    descriptionEl.textContent = shortPreview || "Sin descripcion.";

    if (hasHtml && plainDescription.length > previewMax) {
      descriptionFullEl.innerHTML = rawDescription;
      let expanded = false;
      readMoreBtn.style.display = "block";
      readMoreBtn.textContent = "Leer más";
      readMoreBtn.addEventListener("click", () => {
        expanded = !expanded;
        descriptionFullEl.style.display = expanded ? "block" : "none";
        readMoreBtn.textContent = expanded ? "Ver menos" : "Leer más";
      });
    } else {
      descriptionFullEl.style.display = "none";
      readMoreBtn.style.display = "none";
    }

    if (mod.image) {
      const query = new URLSearchParams({
        folderName: mod.folderName,
        type: mod.type,
        image: mod.image,
        t: String(mod.isActive),
      });
      imageEl.src = `/api/mods/image?${query.toString()}`;
      imageEl.style.display = "block";
      imageEl.style.cursor = "pointer";
      imageEl.title = "Click para filtrar por carpeta";
      imageEl.addEventListener("click", () => {
        const hasSearch = Boolean(state.search.trim());
        const next = hasSearch ? "" : mod.folderName;
        state.search = next;
        searchInput.value = next;
        render();
      });
      imageEl.onerror = () => {
        imageEl.style.display = "none";
      };
    } else {
      imageEl.style.display = "none";
    }

    const busy = state.busyIds.has(mod.id);
    btn.textContent = mod.isActive ? "Desactivar" : "Activar";
    btn.classList.add(mod.isActive ? "deactivate" : "activate");
    btn.disabled = busy;
    if (busy) btn.textContent = "Procesando...";
    btn.addEventListener("click", () => toggleMod(mod));
    uninstallBtn.addEventListener("click", () => uninstallMod(mod));

    if (mod.type === "character") {
      mminfoBtn.addEventListener("click", () => openMmInfoModal(mod));
      fixBtn.addEventListener("click", () => openFixPicker(mod));
    } else {
      mminfoBtn.style.display = "none";
      fixBtn.style.display = "none";
    }

    card.dataset.type = mod.type;
    listEl.appendChild(fragment);
  }
}

async function loadMods() {
  const response = await fetch("/api/mods");
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "No se pudo cargar la lista de mods.");
  }
  state.mods = data.mods;
  render();
}

searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  render();
});

launch3dgimi.addEventListener("click", async () => {
  try {
    await launchTarget("gimi");
  } catch (error) {
    alert(error.message);
  }
});

launchGenshin.addEventListener("click", async () => {
  try {
    await launchTarget("genshin");
  } catch (error) {
    alert(error.message);
  }
});

openGenshinModsWeb.addEventListener("click", () => {
  fetch("/api/open-external", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://gamebanana.com/mods/cats/18140" }),
  }).catch(() => {});
});

if (updateBannerAction) {
  updateBannerAction.addEventListener("click", startUpdateDownload);
}

openSettingsModal.addEventListener("click", () => {
  fillSettingsForm();
  openDialog(settingsModal, true);
});

pick3dmigotoFolder.addEventListener("click", async () => {
  try {
    const response = await fetch("/api/paths/3dmigoto/pick", { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      if (data?.cancelled) return;
      throw new Error(data.error || "No se pudo abrir el selector de carpetas.");
    }
    const selected = String(data.path || "").trim();
    if (!selected) return;
    await ensureMigotoStructure(selected);
    settings3dgimiPath.value = selected;
  } catch (error) {
    alert(error.message);
  }
});

openMigotoFolder.addEventListener("click", async () => {
  try {
    const response = await fetch("/api/open-3dmigoto-folder");
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok !== true) {
      throw new Error(data.error || "No se pudo abrir la carpeta.");
    }
  } catch (error) {
    alert(error.message);
  }
});

openThemeFromSettings.addEventListener("click", () => {
  fillThemeForm();
  openDialog(themeModal, true);
});

settingsCancel.addEventListener("click", () => {
  applyTheme();
  settingsModal.close();
});

themeCancel.addEventListener("click", () => {
  applyTheme();
  themeModal.close();
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await saveSettings();
    settingsModal.close();
  } catch (error) {
    alert(error.message);
  }
});

themeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await saveThemeOnly();
    themeModal.close();
  } catch (error) {
    alert(error.message);
  }
});

[
  settingsThemePrimary,
  settingsThemeUninstall,
  settingsThemeDeactivate,
  settingsThemeConflict,
  settingsThemeBtnGimi,
  settingsThemeBtnGenshin,
  settingsThemeBtnGamebanana,
  settingsThemeBtnSettings,
  settingsThemeBtnOpenFolder,
  settingsThemeBtnExit,
].forEach((input) => {
  input.addEventListener("input", applyThemePreviewFromForm);
});

mminfoCancel.addEventListener("click", () => {
  editingMod = null;
  mminfoImportedImageUrl = "";
  mminfoModal.close();
});

mminfoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveMmInfo();
});

mminfoImage.addEventListener("change", () => {
  const file = mminfoImage.files && mminfoImage.files[0];
  if (file) {
    mminfoImportedImageUrl = "";
    mminfoImageInfo.textContent = `Nueva imagen seleccionada: ${file.name}`;
  }
});

openInfoImportModal.addEventListener("click", () => {
  resetInfoImportModal();
  reopenMmInfoAfterInfoImport = mminfoModal.open;
  if (reopenMmInfoAfterInfoImport) {
    mminfoModal.close();
  }
  openDialog(infoImportModal, true);
});

infoImportAnalyze.addEventListener("click", analyzeInfoImportUrl);
infoImportApply.addEventListener("click", applyInfoImportToMmInfo);
infoImportCancel.addEventListener("click", () => {
  infoImportModal.close();
  resetInfoImportModal();
  if (reopenMmInfoAfterInfoImport) {
    reopenMmInfoAfterInfoImport = false;
    openDialog(mminfoModal, true);
  }
});
infoImportClose.addEventListener("click", () => {
  infoImportModal.close();
  resetInfoImportModal();
  if (reopenMmInfoAfterInfoImport) {
    reopenMmInfoAfterInfoImport = false;
    openDialog(mminfoModal, true);
  }
});

fixPickerCancel.addEventListener("click", () => {
  fixPickerModal.close();
  fixPickerMod = null;
});

openImportModal.addEventListener("click", () => {
  resetImportModal();
  importModal.showModal();
});

importCancel.addEventListener("click", () => {
  importModal.close();
  resetImportModal();
});

importAnalyze.addEventListener("click", analyzeImportUrl);

for (const tab of tabButtons) {
  tab.addEventListener("click", () => {
    setActiveFilter(tab.dataset.filter);
    render();
  });
}

dropZone.addEventListener("click", () => zipInput.click());
dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragover");
  const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  installCharacterArchive(file);
});

zipInput.addEventListener("change", () => {
  const file = zipInput.files && zipInput.files[0];
  installCharacterArchive(file);
  zipInput.value = "";
});

Promise.all([loadSettings(), loadMods()]).catch((error) => {
  alert(error.message);
});
loadUpdateInfo();
loadUpdateStatus();
