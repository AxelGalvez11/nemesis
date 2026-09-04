// Pure helpers for the phone's canvas screen (src/app/(tabs)/canvas.tsx). PURE — no React, no I/O.
//
// Route params and a capability id are untrusted input (the URL is user-editable, and the front
// door is a separate screen owned by another agent) — validated here once, relative-imported so
// Deno can run this file's test the same way canvases.test.ts already does.

import { COMPOSER_CAPABILITIES, type ComposerCapability } from "../learn/web.ts";

/** expo-router hands back a string OR a string[] when a query key repeats. Every screen that
 *  reads useLocalSearchParams needs the same first-wins pick — pulled out so canvas.tsx doesn't
 *  repeat the Array.isArray check for each of `c` / `ask` / `cap`. */
export function firstParam(value: string | readonly string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : (value as string | undefined);
}

/**
 * The `cap` query value, validated against the real capability list rather than trusted blind —
 * a stale link or a typo must fall back to "no capability" rather than crash the
 * `CAPABILITY_COPY[cap]` lookup that draws the chip.
 */
export function capabilityFromParam(value: string | readonly string[] | undefined): ComposerCapability | null {
  const raw = firstParam(value);
  if (!raw) return null;
  return (COMPOSER_CAPABILITIES as readonly string[]).includes(raw) ? (raw as ComposerCapability) : null;
}
