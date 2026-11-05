// NCA Ojo Attendance: Windows desktop app.
// Serves the static web build (../out) from a private app:// address. The app keeps its own local database
// (IndexedDB, stored in this computer's user profile) and syncs with Supabase whenever there is internet.

const { app, BrowserWindow, Menu, net, protocol, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const SCHEME = "app";
const HOST = "nca";
const OUT = path.join(__dirname, "..", "out");

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

function resolveFile(urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, "");
  const base = path.normalize(path.join(OUT, rel));
  if (!base.startsWith(OUT)) return path.join(OUT, "index.html");
  for (const f of [base, path.join(base, "index.html"), base.replace(/[\\/]$/, "") + ".html"]) {
    try {
      if (fs.statSync(f).isFile()) return f;
    } catch {
      /* try next */
    }
  }
  return path.join(OUT, "404.html");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 380,
    minHeight: 600,
    title: "NCA Ojo Attendance",
    icon: path.join(__dirname, "icon.ico"),
    backgroundColor: "#f3f4f7",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });

  // Phone, WhatsApp and other outside links open in the normal browser / dialer
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(`${SCHEME}://${HOST}`)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  win.loadURL(`${SCHEME}://${HOST}/`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [w] = BrowserWindow.getAllWindows();
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    protocol.handle(SCHEME, (req) => net.fetch(pathToFileURL(resolveFile(new URL(req.url).pathname)).toString()));
    createWindow();
    app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
  });

  app.on("window-all-closed", () => app.quit());
}
