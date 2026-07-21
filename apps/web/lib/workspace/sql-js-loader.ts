// Lazy browser loader for sql.js (the WASM SQLite build used by Anki import).
// The runtime ships as static files in public/ (sql-wasm.js + sql-wasm.wasm,
// copied from the sql.js package) and loads via a script tag on first use —
// nothing lands in the app bundle and CSP stays first-party. Failures reset
// the memo so a flaky network can retry.

import type { SqlEngine } from "./anki-package";

type InitSqlJs = (config: { locateFile: (file: string) => string }) => Promise<SqlEngine>;

let enginePromise: Promise<SqlEngine> | null = null;

export function loadSqlEngine(): Promise<SqlEngine> {
  if (enginePromise) return enginePromise;
  enginePromise = new Promise<SqlEngine>((resolve, reject) => {
    const boot = () => {
      const init = (window as { initSqlJs?: InitSqlJs }).initSqlJs;
      if (!init) {
        reject(new Error("The import engine didn't load. Refresh and try again."));
        return;
      }
      init({ locateFile: (file) => `/${file}` }).then(resolve, () => reject(new Error("The import engine didn't load. Refresh and try again.")));
    };
    if ((window as { initSqlJs?: InitSqlJs }).initSqlJs) {
      boot();
      return;
    }
    const script = document.createElement("script");
    script.src = "/sql-wasm.js";
    script.async = true;
    script.onload = boot;
    script.onerror = () => reject(new Error("The import engine didn't load. Check your connection and try again."));
    document.head.appendChild(script);
  }).catch((cause: unknown) => {
    enginePromise = null;
    throw cause;
  });
  return enginePromise;
}
