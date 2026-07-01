"use client";

import { useEffect, useRef } from "react";
import { turnstileSiteKey } from "@/lib/env";

// Minimal, dependency-free Cloudflare Turnstile (explicit-render mode). Renders nothing when no site
// key is configured, so auth is byte-identical until CAPTCHA is activated. Turnstile tokens are
// single-use and short-lived (~300s): on any auth failure the parent remounts this widget (via a
// changing React `key`), which unmounts → removes → re-renders a fresh challenge.

interface TurnstileOptions {
  sitekey: string;
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
  theme?: "auto" | "light" | "dark";
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: TurnstileOptions) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
  }
}

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<void> | null = null;

/** Inject the Turnstile script once and resolve when window.turnstile is ready. */
function loadTurnstile(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const waitForReady = () => {
      const start = Date.now();
      const tick = () => {
        if (window.turnstile) resolve();
        else if (Date.now() - start > 10000) reject(new Error("turnstile load timeout"));
        else window.setTimeout(tick, 50);
      };
      tick();
    };

    const existing = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
    if (existing) {
      existing.addEventListener("load", waitForReady);
      waitForReady();
      return;
    }

    const script = document.createElement("script");
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.defer = true;
    script.setAttribute("data-turnstile", "1");
    script.onload = waitForReady;
    script.onerror = () => reject(new Error("turnstile script failed to load"));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

interface TurnstileWidgetProps {
  /** Receives the token on success, and "" on expiry/error (so the parent can block submit). */
  onToken: (token: string) => void;
}

export function TurnstileWidget({ onToken }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Keep the latest callback without re-running the render effect.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!turnstileSiteKey || !containerRef.current) return;
    let widgetId: string | undefined;
    let cancelled = false;

    loadTurnstile()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: turnstileSiteKey,
          theme: "auto",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(""),
          "error-callback": () => onTokenRef.current(""),
        });
      })
      .catch(() => onTokenRef.current(""));

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          /* widget already gone */
        }
      }
    };
  }, []);

  if (!turnstileSiteKey) return null;
  return <div ref={containerRef} style={{ display: "flex", justifyContent: "center", margin: "2px 0" }} />;
}
