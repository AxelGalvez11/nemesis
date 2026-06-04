import { useEffect, useState } from "react";

// Minimal connectivity hook for the doc-06 "offline" state. Web-only on purpose: it
// reads navigator.onLine and the window online/offline events, which is what react-
// native-web exposes (and what the headless gate drives via Playwright setOffline).
// Native uses @react-native-community/netinfo at the device-checklist stage — pulling
// NetInfo in here would only add the RNW dep-compat risk the plan calls out, for a
// path whose web behavior is just navigator.onLine anyway.
//
// Defaults to online when the API is unavailable (native / SSR) so it never shows a
// false offline banner where it cannot actually observe connectivity.
function readOnline(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") return true;
  return navigator.onLine;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(readOnline);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    const sync = () => setOnline(readOnline());
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return online;
}
