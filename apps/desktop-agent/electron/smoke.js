// Windowless boot smoke for the full dependency graph main.js loads.
const { app, safeStorage } = require("electron");
const path = require("path"); const fs = require("fs"); const os = require("os");
const config = require("./config.js"); const { Store } = require("./state.js"); const { processFile } = require("./pipeline.js");
const { computeBrief } = require("./brief.js"); const { buildCourses } = require("./courses.js"); const portal = require("./portal.js");
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pharmaorb-smoke-"));
    config.init(dir, safeStorage);
    config.setSecret("canvas-test", "tok_123"); // exercise secure secret store
    const store = new Store(dir);
    const f = path.join(dir, "note.txt"); fs.writeFileSync(f, "Metformin lowers hepatic glucose output.");
    const r = await processFile(f, { apiKey: null, outDir: dir, watchFolder: dir }, store);
    const brief = computeBrief(store.recentActivity(50), new Date().toISOString());
    console.log("SMOKE ok:", JSON.stringify({ pipeline: r.status, secretRoundtrip: config.getSecret("canvas-test") === "tok_123", playwright: portal.isAvailable(), briefKeys: Object.keys(brief).length, courses: buildCourses([]).length }));
    console.log("safeStorage:", safeStorage.isEncryptionAvailable());
    app.exit(0);
  } catch (e) { console.error("SMOKE FAIL:", (e && e.stack) || e); app.exit(1); }
});
app.on("window-all-closed", () => {});
