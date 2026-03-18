// ==UserScript==
// @name         GSMM - Descargar En Mod Manager
// @namespace    gsmm-local
// @version      1.1.0
// @description  Agrega un boton en GameBanana para importar el mod directamente a Renatta's Genshin Mod Manager (RGMM).
// @author       Joaquin
// @match        https://gamebanana.com/mods/*
// @match        https://www.gamebanana.com/mods/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const API_URL = "http://localhost:3210/api/web/quick-import";
  const REQUIRED_PAGE_DESCRIPTION_TEXT = "A Mod for Genshin Impact";

  function isModPage() {
    return /\/mods\/\d+/i.test(window.location.pathname);
  }

  function shouldRenderByPageDescription() {
    const pageDesc = document.querySelector("#PageDescription");
    if (!pageDesc) return false;
    const text = (pageDesc.textContent || "").trim();
    return text.toLowerCase().includes(REQUIRED_PAGE_DESCRIPTION_TEXT.toLowerCase());
  }

  function ensureButtonStyles() {
    if (document.getElementById("gsmm-import-style")) return;
    const style = document.createElement("style");
    style.id = "gsmm-import-style";
    style.textContent = `
      .gsmm-import-wrap {
        margin: 10px 0;
        padding: 10px;
        border: 1px solid #2a7f43;
        background: #102417;
        border-radius: 8px;
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 10px;
      }
      .gsmm-import-left {
        display: grid;
        gap: 8px;
      }
      .gsmm-import-select {
        width: 100%;
        min-width: 260px;
        border: 1px solid #2e5a41;
        border-radius: 6px;
        background: #0d1d14;
        color: #d3f7e0;
        padding: 6px 8px;
      }
      .gsmm-import-btn {
        border: 0;
        border-radius: 6px;
        background: #26a96a;
        color: #fff;
        font-weight: 700;
        padding: 8px 12px;
        cursor: pointer;
      }
      .gsmm-import-btn:disabled {
        opacity: .7;
        cursor: wait;
      }
      .gsmm-import-status {
        font-size: 12px;
        opacity: .9;
      }
      .gsmm-import-status.error {
        color: #ff9f9f;
      }
      .gsmm-import-status.ok {
        color: #8ce6b1;
      }
      @media (max-width: 760px) {
        .gsmm-import-wrap {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function findTargetModule() {
    return document.querySelector("module#ScreenshotsModule");
  }

  function readAvailableVersions() {
    const filesModule = document.querySelector("module#FilesModule, #FilesModule");
    const versions = [];
    const seen = new Set();
    const add = (name, href) => {
      if (!href) return;
      let abs = "";
      try {
        abs = new URL(href, window.location.href).toString();
      } catch {
        return;
      }
      if (!/gamebanana\.com\/dl\/\d+/i.test(abs)) return;
      if (seen.has(abs)) return;
      seen.add(abs);
      versions.push({
        name: (name || "").trim() || `Archivo ${versions.length + 1}`,
        url: abs,
      });
    };

    if (filesModule) {
      filesModule.querySelectorAll("li.File").forEach((li) => {
        const nameEl = li.querySelector("span.FileName");
        const linkEl =
          li.querySelector("a.DownloadLink.GreenColor[href]") ||
          li.querySelector("a.DownloadLink[href*='/dl/']") ||
          li.querySelector("a[href*='gamebanana.com/dl/']");
        add(nameEl ? nameEl.textContent : "", linkEl ? linkEl.getAttribute("href") : "");
      });

      if (!versions.length) {
        filesModule.querySelectorAll("a.DownloadLink.GreenColor[href], a.DownloadLink[href*='/dl/'], a[href*='gamebanana.com/dl/']").forEach((a) => {
          add((a.textContent || "").trim(), a.getAttribute("href"));
        });
      }
    }

    return versions;
  }

  function fillVersionSelect(selectEl, versions, preserveUrl) {
    selectEl.innerHTML = "";
    if (!versions.length) {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Version automática (primera disponible)";
      selectEl.appendChild(empty);
      return;
    }

    for (const version of versions) {
      const option = document.createElement("option");
      option.value = version.url;
      option.textContent = version.name;
      selectEl.appendChild(option);
    }

    if (preserveUrl) {
      const found = versions.find((v) => v.url === preserveUrl);
      if (found) selectEl.value = preserveUrl;
    }
  }

  function createButtonBlock() {
    const wrap = document.createElement("div");
    wrap.className = "gsmm-import-wrap";
    wrap.id = "gsmm-import-wrap";

    const left = document.createElement("div");
    left.className = "gsmm-import-left";

    const versionSelect = document.createElement("select");
    versionSelect.className = "gsmm-import-select";

    const initialVersions = readAvailableVersions();
    fillVersionSelect(versionSelect, initialVersions, "");

    const button = document.createElement("button");
    button.className = "gsmm-import-btn";
    button.type = "button";
    button.textContent = "Descargar en Mod Manager";

    const status = document.createElement("span");
    status.className = "gsmm-import-status";
    status.textContent = initialVersions.length
      ? `Versiones detectadas: ${initialVersions.length}`
      : "No pude leer versiones de la web, usaré selección automática.";

    button.addEventListener("click", () => {
      const previousUrl = versionSelect.value;
      const versions = readAvailableVersions();
      fillVersionSelect(versionSelect, versions, previousUrl);
      const selectedUrl = versionSelect.value;
      const selectedVersion = versions.find((v) => v.url === selectedUrl) || null;

      button.disabled = true;
      button.textContent = "Importando...";
      status.className = "gsmm-import-status";
      status.textContent = "Enviando solicitud al gestor...";

      GM_xmlhttpRequest({
        method: "POST",
        url: API_URL,
        headers: {
          "Content-Type": "application/json",
        },
        data: JSON.stringify({
          url: window.location.href,
          fileUrl: selectedVersion ? selectedVersion.url : "",
          fileName: selectedVersion ? selectedVersion.name : "",
        }),
        timeout: 120000,
        onload: (response) => {
          button.disabled = false;
          button.textContent = "Descargar en Mod Manager";
          let payload = null;
          try {
            payload = JSON.parse(response.responseText || "{}");
          } catch {
            payload = null;
          }

          if (response.status >= 200 && response.status < 300 && payload && payload.ok) {
            const folder = payload.install && payload.install.installedFolder ? payload.install.installedFolder : "";
            status.className = "gsmm-import-status ok";
            status.textContent = folder
              ? `Importado correctamente: ${folder}`
              : "Importado correctamente.";
            return;
          }

          const err =
            (payload && payload.error) ||
            `Error HTTP ${response.status}. ¿Esta abierto el Mod Manager en http://localhost:3210?`;
          status.className = "gsmm-import-status error";
          status.textContent = err;
        },
        onerror: () => {
          button.disabled = false;
          button.textContent = "Descargar en Mod Manager";
          status.className = "gsmm-import-status error";
          status.textContent =
            "No pude conectar con el Mod Manager. Abre la app primero (http://localhost:3210).";
        },
        ontimeout: () => {
          button.disabled = false;
          button.textContent = "Descargar en Mod Manager";
          status.className = "gsmm-import-status error";
          status.textContent = "Tiempo de espera agotado.";
        },
      });
    });

    left.appendChild(versionSelect);
    left.appendChild(status);
    wrap.appendChild(left);
    wrap.appendChild(button);
    return wrap;
  }

  function injectButtonIfPossible() {
    if (!isModPage()) return;
    if (!shouldRenderByPageDescription()) return;
    if (document.getElementById("gsmm-import-wrap")) return;
    const screenshotsModule = findTargetModule();
    if (!screenshotsModule || !screenshotsModule.parentElement) return;

    ensureButtonStyles();
    const block = createButtonBlock();
    screenshotsModule.insertAdjacentElement("afterend", block);
  }

  injectButtonIfPossible();

  const observer = new MutationObserver(() => {
    injectButtonIfPossible();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  let lastHref = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      const existing = document.getElementById("gsmm-import-wrap");
      if (existing) existing.remove();
      injectButtonIfPossible();
    }
  }, 500);
})();
