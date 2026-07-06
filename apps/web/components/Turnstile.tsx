"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { turnstileSiteKey } from "@/lib/env";

// Cloudflare Turnstile (CAPTCHA) widget. Renders a bot challenge that produces a single-use token;
// the token is handed to supabase.auth via options.captchaToken, and Supabase verifies it server-side
// against the secret key. When NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset the component renders nothing
// and reports no token, so auth forms behave exactly as they did before configuration.

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  appearance?: "always" | "execute" | "interaction-only";
  theme?: "auto" | "light" | "dark";
}

interface TurnstileApi {
  render: (el: HTMLElement, opts: TurnstileRenderOptions) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export interface TurnstileHandle {
  /** Discard the consumed token and re-arm the widget (tokens are single-use; reset after a failed submit). */
  reset: () => void;
}

interface TurnstileProps {
  onToken: (token: string | null) => void;
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Clear the cached promise so a later remount can retry instead of being stuck on a
      // permanently-rejected promise (otherwise a transient network blip locks the form for the session).
      scriptPromise = null;
      reject(new Error("turnstile_script_load_failed"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export const Turnstile = forwardRef<TurnstileHandle, TurnstileProps>(function Turnstile({ onToken }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Hold the latest callback in a ref so the render effect stays stable (runs once) even if the
  // parent passes a new function identity on re-render.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useImperativeHandle(ref, () => ({
    reset() {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
        onTokenRef.current(null);
      }
    },
  }), []);

  useEffect(() => {
    if (!turnstileSiteKey) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || widgetIdRef.current || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: turnstileSiteKey,
          callback: (token) => onTokenRef.current(token),
          "error-callback": () => onTokenRef.current(null),
          "expired-callback": () => onTokenRef.current(null),
          appearance: "interaction-only",
          theme: "auto",
        });
      })
      .catch(() => {
        // Script blocked or offline: fail open on the client (no token). Supabase still rejects the
        // request if a captcha is required server-side, so this never weakens enforcement.
      });
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, []);

  if (!turnstileSiteKey) return null;
  return <div ref={containerRef} style={{ display: "flex", justifyContent: "center", margin: "2px 0" }} />;
});
