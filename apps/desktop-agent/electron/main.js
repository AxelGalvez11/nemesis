// PharmaOrb desktop agent — orchestrator.
// A local-first school agent: watches your files, turns lectures into pharmacy-grade study material,
// connects to your logged-in portals (Playwright), builds a daily brief, and embeds the real PharmaOrb
// web app for chat/research. NO submit path exists anywhere — everything produced is a reviewable draft.

const { app, BrowserWindow, Tray, Menu, dialog, ipcMain, shell, safeStorage, nativeImage, powerSaveBlocker } = require("electron");
const path = require("path");
const fs = require("fs");
const chokidar = require("chokidar");

const config = require("./config.js");
const { Store } = require("./state.js");
const { processFile } = require("./pipeline.js");
const { checkKey } = require("./llm.js");
const { computeBrief, studyNudge } = require("./brief.js");
const { buildCourses } = require("./courses.js");
const portal = require("./portal.js");

let win = null;
let tray = null;
let watcher = null;
let store = null;
let outputDir = null;

const queue = [];
let working = false;
let saveBlockerId = null;

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); return p; }
function outputDirFor() { return ensureDir(path.join(app.getPath("documents"), "PharmaOrb Study")); }

function createWindow() {
  win = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    title: "PharmaOrb",
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true, // used only to embed the first-party app at app.pharmaorb.app
    },
  });
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  win.on("close", (e) => {
    if (!app.isQuitting && tray) { e.preventDefault(); win.hide(); }
  });
}

function pushActivity(entry) {
  if (win && !win.isDestroyed()) win.webContents.send("agent:activity", entry);
}

function processConfig() {
  const s = config.getSettings();
  return { apiKey: config.getApiKey(), baseUrl: s.baseUrl, model: s.model, outDir: outputDir, watchFolder: s.watchFolder };
}

function enqueue(filePath) { if (!queue.includes(filePath)) queue.push(filePath); drain(); }

async function drain() {
  if (working) return;
  working = true;
  if (saveBlockerId === null) saveBlockerId = powerSaveBlocker.start("prevent-app-suspension");
  try {
    while (queue.length) {
      const filePath = queue.shift();
      try {
        const result = await processFile(filePath, processConfig(), store,
          (m) => pushActivity({ status: "working", source: path.basename(filePath), reason: m, at: new Date().toISOString() }));
        if (result.status !== "ignored" && result.status !== "skipped") pushActivity(result);
      } catch (e) {
        pushActivity({ status: "error", source: path.basename(filePath), reason: e && e.message ? e.message : String(e), at: new Date().toISOString() });
      }
    }
  } finally {
    working = false;
    if (saveBlockerId !== null) { powerSaveBlocker.stop(saveBlockerId); saveBlockerId = null; }
  }
}

function startWatching(folder) {
  if (watcher) { watcher.close(); watcher = null; }
  if (!folder || !fs.existsSync(folder)) return;
  watcher = chokidar.watch(folder, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 1200, pollInterval: 200 },
    depth: 4,
    ignored: /(^|[\\/])(\..|node_modules|PharmaOrb Study)([\\/]|$)/,
  });
  watcher.on("add", (p) => enqueue(p));
}

function buildTray() {
  try {
    const img = nativeImage.createFromDataURL("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAo0BEC0iAAAAAElFTkSuQmCC");
    tray = new Tray(img);
    tray.setToolTip("PharmaOrb school agent");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "Open PharmaOrb", click: () => { if (win) win.show(); else createWindow(); } },
      { label: "Scan watched folder now", click: () => scanNow() },
      { label: "Open study output folder", click: () => shell.openPath(outputDir) },
      { type: "separator" },
      { label: "Quit", click: () => { app.isQuitting = true; app.quit(); } },
    ]));
    tray.on("click", () => { if (win) win.show(); });
  } catch (_) { tray = null; }
}

function scanNow() {
  const folder = config.getSettings().watchFolder;
  if (folder) startWatching(folder);
}

function safeCourse(n) { return String(n || "portal").replace(/[^\w \-]+/g, "").trim().slice(0, 40) || "portal"; }
function portalDownloadsDir() { return ensureDir(path.join(app.getPath("userData"), "portal-downloads")); }

// The autopilot action: pull NEW lecture files from a portal (unseen only) and feed them into the same
// generate-study-material pipeline. Canvas via its API; other portals via the logged-in browser session.
async function syncPortal(p) {
  if (!p) return { ok: false, reason: "no portal" };
  const dlRoot = portalDownloadsDir();
  let pulled = 0;
  if (p.type === "canvas") {
    const token = config.getSecret(`canvas-${p.name}`);
    const r = await portal.canvasFiles({ baseUrl: p.canvasBaseUrl || p.url, token });
    if (!r.ok) return r;
    for (const f of r.files) {
      if (store.isSeen(f.id)) continue;
      if (!/\.(pdf|txt|md)$/i.test(f.name)) { store.markSeen(f.id, { skipped: "not a PDF" }); continue; }
      const dest = path.join(dlRoot, safeCourse(f.courseName), f.name);
      const dl = await portal.downloadUrl(f.url, dest);
      store.markSeen(f.id);
      if (dl.ok) { pulled++; enqueue(dest); }
    }
  } else {
    const r = await portal.harvestBrowserPortal({ baseDir: app.getPath("userData"), name: p.name, url: p.url, outDir: path.join(dlRoot, safeCourse(p.name)), seenIds: Object.keys(store.data.seen) });
    if (!r.ok) return r;
    for (const f of r.downloaded) { store.markSeen(f.id); pulled++; enqueue(f.path); }
  }
  const entry = store.addActivity({ status: "portal", source: p.name, reason: pulled ? `pulled ${pulled} new file(s)` : "no new files" });
  pushActivity(entry);
  return { ok: true, pulled };
}

async function syncAllConnected() {
  for (const p of (config.getSettings().portals || [])) {
    if (p.type === "canvas" || p.connected) { try { await syncPortal(p); } catch (_) { /* one bad portal never stops the rest */ } }
  }
}

let portalTimer = null;
function startPortalSchedule() {
  if (portalTimer) { clearInterval(portalTimer); portalTimer = null; }
  if (config.getSettings().autoSync === false) return;
  portalTimer = setInterval(() => syncAllConnected(), 30 * 60 * 1000); // every 30 min while running
}

function status() {
  const s = config.getSettings();
  return {
    watchFolder: s.watchFolder,
    hasKey: config.hasApiKey(),
    outputDir,
    model: s.model,
    baseUrl: s.baseUrl,
    theme: s.theme || "dark",
    autoSync: s.autoSync !== false,
    assistantUrl: s.assistantUrl || "https://app.pharmaorb.app",
    processedCount: Object.keys(store.data.processed).length,
    activity: store.recentActivity(80),
    portals: (s.portals || []).map((p) => ({ name: p.name, url: p.url, type: p.type || "browser", canvasBaseUrl: p.canvasBaseUrl || null, connected: Boolean(p.connected) })),
    playwrightReady: portal.isAvailable(),
  };
}

app.whenReady().then(() => {
  config.init(app.getPath("userData"), safeStorage);
  store = new Store(app.getPath("userData"));
  outputDir = outputDirFor();
  createWindow();
  buildTray();
  const folder = config.getSettings().watchFolder;
  if (folder) startWatching(folder);
  startPortalSchedule();

  // ── core / status ──
  ipcMain.handle("agent:getStatus", () => status());
  ipcMain.handle("agent:scanNow", () => { scanNow(); return status(); });
  ipcMain.handle("agent:openOutputFolder", () => { shell.openPath(outputDir); return true; });
  ipcMain.handle("agent:openDeck", (_e, d) => { if (d) shell.openPath(d); return true; });
  ipcMain.handle("agent:openExternal", (_e, u) => { if (u) shell.openExternal(u); return true; });

  ipcMain.handle("agent:pickWatchFolder", async () => {
    const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"], title: "Pick a folder to watch (e.g. Downloads or a course folder)" });
    if (r.canceled || !r.filePaths[0]) return status();
    config.saveSettings({ watchFolder: r.filePaths[0] });
    startWatching(r.filePaths[0]);
    return status();
  });

  // ── key / settings ──
  ipcMain.handle("agent:setApiKey", async (_e, key) => {
    const k = String(key || "").trim();
    if (!k) return { ok: false, reason: "empty key" };
    const check = await checkKey(k, config.getSettings().baseUrl);
    if (!check.ok) return { ok: false, reason: check.reason };
    try { config.setApiKey(k); } catch (e) { return { ok: false, reason: e.message }; }
    scanNow();
    return { ok: true, status: status() };
  });
  ipcMain.handle("agent:clearApiKey", () => { config.setApiKey(null); return status(); });
  ipcMain.handle("agent:setSetting", (_e, patch) => { config.saveSettings(patch || {}); startPortalSchedule(); return status(); });
  ipcMain.handle("agent:syncAll", async () => { await syncAllConnected(); return status(); });

  // ── daily brief ──
  ipcMain.handle("agent:getBrief", async () => {
    const facts = computeBrief(store.recentActivity(400), new Date().toISOString());
    const s = config.getSettings();
    const nudge = await studyNudge(facts, { apiKey: config.getApiKey(), baseUrl: s.baseUrl, model: s.model });
    return { facts, nudge };
  });

  // ── courses ──
  ipcMain.handle("agent:getCourses", () => buildCourses(store.recentActivity(400)));

  // ── portals (Playwright) ──
  ipcMain.handle("agent:savePortal", (_e, p) => {
    const s = config.getSettings();
    const portals = (s.portals || []).filter((x) => x.name !== p.name);
    portals.push({ name: p.name, url: p.url, type: p.type || "browser", canvasBaseUrl: p.canvasBaseUrl || null, connected: false });
    if (p.type === "canvas" && p.token) { try { config.setSecret(`canvas-${p.name}`, p.token); } catch (_) {} }
    config.saveSettings({ portals });
    return status();
  });
  ipcMain.handle("agent:removePortal", (_e, name) => {
    const s = config.getSettings();
    config.saveSettings({ portals: (s.portals || []).filter((x) => x.name !== name) });
    return status();
  });
  ipcMain.handle("agent:connectPortal", async (_e, name) => {
    const s = config.getSettings();
    const p = (s.portals || []).find((x) => x.name === name);
    if (!p) return { ok: false, reason: "portal not found" };
    if (!portal.isAvailable()) return { ok: false, reason: "playwright-not-installed" };
    const r = await portal.connectPortal({ baseDir: app.getPath("userData"), name: p.name, url: p.url });
    if (r.ok) {
      const portals = (s.portals || []).map((x) => x.name === name ? Object.assign({}, x, { connected: true }) : x);
      config.saveSettings({ portals });
    }
    return r;
  });
  ipcMain.handle("agent:scanPortal", async (_e, name) => {
    const p = (config.getSettings().portals || []).find((x) => x.name === name);
    if (!p) return { ok: false, reason: "portal not found" };
    return await syncPortal(p); // the real autopilot action: pull new files -> generate study material
  });

  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else if (win) win.show(); });
});

app.on("window-all-closed", () => { if (!tray) app.quit(); });
app.on("before-quit", () => { app.isQuitting = true; if (watcher) watcher.close(); });
