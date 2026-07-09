// App settings + SECURE api-key storage. The DeepSeek key is encrypted with Electron safeStorage (backed
// by the OS keychain — macOS Keychain / Windows DPAPI), never written in plaintext. Other settings live
// in a plain JSON file. safeStorage is only available in the main process, so this module is main-only.

const fs = require("fs");
const path = require("path");

let settingsPath;
let keyPath;
let safeStorage;

function init(userDataDir, electronSafeStorage) {
  settingsPath = path.join(userDataDir, "settings.json");
  keyPath = path.join(userDataDir, "deepseek-key.enc");
  safeStorage = electronSafeStorage;
}

function getSettings() {
  try {
    if (fs.existsSync(settingsPath)) return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch (_) { /* fall through to defaults */ }
  return { watchFolder: null, baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" };
}

function saveSettings(patch) {
  const next = Object.assign(getSettings(), patch || {});
  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2));
  return next;
}

function setApiKey(key) {
  if (!key) {
    try { fs.existsSync(keyPath) && fs.unlinkSync(keyPath); } catch (_) { /* ignore */ }
    return;
  }
  if (safeStorage && safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(keyPath, safeStorage.encryptString(key));
  } else {
    // Encryption unavailable (rare on desktop). Refuse plaintext — that's a hard security bar.
    throw new Error("secure key storage is unavailable on this system; cannot store the key safely");
  }
}

function getApiKey() {
  try {
    if (fs.existsSync(keyPath) && safeStorage && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(fs.readFileSync(keyPath));
    }
  } catch (_) { /* fall through */ }
  return null;
}

function hasApiKey() {
  return Boolean(getApiKey());
}

// Generic named secrets (e.g. a Canvas access token), same encrypted-at-rest storage as the API key.
function secretPath(name) {
  return path.join(path.dirname(settingsPath), `secret-${String(name).replace(/[^a-z0-9]+/gi, "_")}.enc`);
}
function setSecret(name, value) {
  const p = secretPath(name);
  if (!value) { try { fs.existsSync(p) && fs.unlinkSync(p); } catch (_) { /* ignore */ } return; }
  if (safeStorage && safeStorage.isEncryptionAvailable()) fs.writeFileSync(p, safeStorage.encryptString(value));
  else throw new Error("secure storage unavailable");
}
function getSecret(name) {
  try {
    const p = secretPath(name);
    if (fs.existsSync(p) && safeStorage && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(fs.readFileSync(p));
    }
  } catch (_) { /* fall through */ }
  return null;
}

module.exports = { init, getSettings, saveSettings, setApiKey, getApiKey, hasApiKey, setSecret, getSecret };
