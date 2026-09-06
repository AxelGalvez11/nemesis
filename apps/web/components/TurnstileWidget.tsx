"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  /** "interaction-only" keeps the box hidden unless Cloudflare actually needs the visitor to
   *  click something; most people never see it. "always" is the old permanent Verifying… panel. */
  appearance?: "always" | "execute" | "interaction-only";
  /** "flexible" lets the box match the width of the form column instead of a fixed 300px. */
  size?: "normal" | "flexible" | "compact";
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
          // Owner 2026-09-04: the permanent "Verifying…" panel sat in the middle of the sign-in
          // form on every visit and made the page look broken. Interaction-only runs the check
          // silently and only draws the box when a human really has to click.
          appearance: "interaction-only",
          size: "flexible",
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
  // No margin of its own: when Cloudflare stays silent the box is 0px tall and must not leave a
  // gap in the form. When it does draw, it fills the column (size: flexible) like the fields above.
  return <div ref={containerRef} className="nemesis-auth-captcha" />;
}

/** How long a submit waits for a silent Turnstile check before giving up. Cloudflare's
 *  interaction-only run usually finishes in under a second; eight covers a slow phone. */
const CAPTCHA_WAIT_MS = 8_000;

/**
 * Everything an auth form needs to run the captcha WITHOUT showing it.
 *
 * The old forms disabled their submit button until a token arrived, which meant every visitor
 * stared at a greyed-out button and a Cloudflare panel for a second or two. With the widget in
 * interaction-only mode the button stays live; `waitForToken` is called inside submit and only
 * makes the visitor wait when the check has genuinely not finished yet.
 *
 * `reset()` remounts the widget (tokens are single-use) after any failed attempt.
 */
export function useCaptcha() {
  const [token, setTokenState] = useState("");
  const [key, setKey] = useState(0);
  const tokenRef = useRef("");
  const setToken = useCallback((next: string) => {
    tokenRef.current = next;
    setTokenState(next);
  }, []);
  const reset = useCallback(() => {
    tokenRef.current = "";
    setTokenState("");
    setKey((k) => k + 1);
  }, []);
  const waitForToken = useCallback(async (): Promise<string> => {
    if (!turnstileSiteKey) return "";
    const start = Date.now();
    while (!tokenRef.current && Date.now() - start < CAPTCHA_WAIT_MS) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    return tokenRef.current;
  }, []);
  return { token, key, setToken, reset, waitForToken };
}
