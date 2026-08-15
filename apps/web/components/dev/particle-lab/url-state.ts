import { CANDIDATES, candidateById } from "./candidates";
import { defaults } from "./types";
import type { Params } from "./types";

/**
 * Lab state in the URL hash, so a configuration can be reloaded or pasted back
 * to the agent verbatim.
 *
 * Only params that DIFFER from the candidate's defaults are written. A URL that
 * lists every knob is unreadable and, worse, freezes the defaults — if a default
 * is later retuned, a stale full URL would silently pin the old value while
 * looking like an ordinary link.
 */

export type Mode = "grid" | "inspect" | "compare";

export type LabState = {
  readonly mode: Mode;
  readonly focus: string;
  readonly compare: readonly string[];
  readonly theme: "light" | "dark";
  /** Per-candidate overrides, keyed by candidate id. */
  readonly params: Readonly<Record<string, Params>>;
};

export const INITIAL: LabState = {
  mode: "grid",
  focus: "A",
  compare: ["A", "D"],
  theme: "light",
  params: {},
};

function encodeParams(id: string, params: Params): string {
  const candidate = candidateById(id);
  if (!candidate) return "";
  const parts: string[] = [];
  for (const spec of candidate.params) {
    const v = params[spec.key];
    if (v === undefined || v === spec.def) continue;
    parts.push(`${spec.key}~${Number(v.toFixed(4))}`);
  }
  return parts.join(",");
}

export function encode(state: LabState): string {
  const q = new URLSearchParams();
  q.set("m", state.mode);
  q.set("c", state.focus);
  if (state.compare.length) q.set("k", state.compare.join("."));
  if (state.theme !== "light") q.set("t", state.theme);

  for (const c of CANDIDATES) {
    const p = state.params[c.id];
    if (!p) continue;
    const enc = encodeParams(c.id, p);
    if (enc) q.set(`p${c.id}`, enc);
  }
  return q.toString();
}

export function decode(hash: string): LabState {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return INITIAL;

  const q = new URLSearchParams(raw);
  const mode = q.get("m");
  const focus = q.get("c");
  const compare = q.get("k")?.split(".").filter((id) => candidateById(id)) ?? INITIAL.compare;

  const params: Record<string, Params> = {};
  for (const c of CANDIDATES) {
    const enc = q.get(`p${c.id}`);
    if (!enc) continue;
    const merged: Record<string, number> = { ...defaults(c) };
    for (const pair of enc.split(",")) {
      const [key, value] = pair.split("~");
      if (!key) continue;
      const spec = c.params.find((s) => s.key === key);
      if (!spec) continue;
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      // Clamp rather than trust: a hand-edited URL should not be able to push a
      // uniform somewhere the shader was never exercised at.
      merged[key] = Math.min(spec.max, Math.max(spec.min, n));
    }
    params[c.id] = merged;
  }

  return {
    mode: mode === "inspect" || mode === "compare" ? mode : "grid",
    focus: focus && candidateById(focus) ? focus : INITIAL.focus,
    compare: compare.length ? compare.slice(0, 3) : INITIAL.compare,
    theme: q.get("t") === "dark" ? "dark" : "light",
    params,
  };
}

/** The block the "Copy settings" button puts on the clipboard. */
export function settingsReport(id: string, params: Params, url: string): string {
  const candidate = candidateById(id);
  if (!candidate) return "";
  const lines = [`Candidate ${candidate.id} — ${candidate.name}`, `Technique: ${candidate.technique}`, ""];
  for (const spec of candidate.params) {
    const v = params[spec.key] ?? spec.def;
    const changed = v !== spec.def ? "   <- changed" : "";
    lines.push(`${spec.label.padEnd(20)} ${String(v).padEnd(8)}${changed}`);
  }
  lines.push("", url);
  return lines.join("\n");
}
