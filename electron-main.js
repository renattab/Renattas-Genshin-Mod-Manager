const { app, BrowserWindow, dialog, Menu } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

app.commandLine.appendSwitch("disable-gpu");
const userDataPath = path.join(app.getPath("appData"), "RGMM");
app.setPath("userData", userDataPath);
app.setPath("cache", path.join(userDataPath, "Cache"));
app.commandLine.appendSwitch("disk-cache-dir", path.join(userDataPath, "Cache"));

const SERVER_PORT = 3210;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const SERVER_URL_ELECTRON = `${SERVER_URL}/?rgmm=1`;
let serverProcess = null;
let mainWindow = null;
let isQuitting = false;
const appIconPath = path.join(__dirname, "icon.ico");

if (process.platform === "win32") {
  app.setAppUserModelId("com.renatta.rgmm");
}
let allowWindowClose = false;

function startServer() {
  const serverPath = path.join(__dirname, "server.js");
  serverProcess = spawn(process.execPath, [serverPath], {
    env: { ...process.env, RGMM_ELECTRON: "1" },
    stdio: "inherit",
    windowsHide: true,
  });

  serverProcess.on("exit", () => {
    serverProcess = null;
  });
}

function createWindow() {
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    show: false,
    icon: appIconPath,
    webPreferences: {
      contextIsolation: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    if (url === SERVER_URL) {
      setTimeout(() => {
        if (mainWindow && !isQuitting) {
          mainWindow.loadURL(SERVER_URL_ELECTRON);
        }
      }, 500);
    }
  });

  mainWindow.loadURL("about:blank");

  mainWindow.on("close", (event) => {
    if (!allowWindowClose) {
      event.preventDefault();
      allowWindowClose = true;
      app.quit();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function stopServer() {
  if (!serverProcess) return;
  try {
    serverProcess.kill();
  } catch {
    // ignore
  }
  serverProcess = null;
}

function waitForServerReady(timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(SERVER_URL, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      req.on("error", retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error("Server did not become ready in time."));
        return;
      }
      setTimeout(attempt, 300);
    };
    attempt();
  });
}

app.whenReady().then(async () => {
  startServer();
  createWindow();
  try {
    await waitForServerReady();
    if (mainWindow && !isQuitting) {
      mainWindow.loadURL(SERVER_URL_ELECTRON);
    }
  } catch (error) {
    dialog.showErrorBox("RGMM", "No se pudo iniciar el servidor local.");
  }
});

process.on("uncaughtException", (err) => {
  dialog.showErrorBox("RGMM", `Error inesperado: ${err.message || err}`);
});

app.on("before-quit", () => {
  isQuitting = true;
  stopServer();
});

app.on("window-all-closed", () => {
});
