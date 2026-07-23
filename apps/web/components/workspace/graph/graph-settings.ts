// Graph controls state — verbatim constants from desktop graph/index.tsx §B.3.
// Persisted to localStorage["nemesis.graph.settings.v1"].

export const GRAPH_SETTINGS_KEY = "nemesis.graph.settings.v1";
export const MIN_NODE_SIZE = 1;
export const MAX_NODE_SIZE = 4;
export const MIN_LABEL_SIZE = 1;
export const MAX_LABEL_SIZE = 4;

export const MIN_LINK_THICKNESS = 0.4;
export const MAX_LINK_THICKNESS = 4;
export const MAX_TEXT_FADE = 3;

export interface GraphControlsState {
  dimensions: 2 | 3;
  labelSize: number;
  nodeSize: number;
  /** 3D: "Spread". 2D: "Link distance". */
  spread: number;
  /** 2D label: "Repel force". */
  repulsion: number;
  /** 2D label: "Center force". */
  gravity: number;
  /** 3D only. */
  rotationSpeed: number;
  showNames: boolean;
  /** 3D only — the 2D canvas draws flat, like Obsidian. */
  neighborGlow: boolean;
  // ── 2D only, mirroring Obsidian's graph settings ──────────────────────────
  /** How tightly a link pulls its two nodes together. */
  linkForce: number;
  /** Line width for every link. */
  linkThickness: number;
  /** Zoom level below which note names fade out. 0 keeps them always on. */
  textFadeThreshold: number;
  /** Draw link direction. */
  showArrows: boolean;
  /** Show notes that have no links at all. */
  showOrphans: boolean;
}

export const DEFAULT_CONTROLS: GraphControlsState = {
  dimensions: 3,
  gravity: 0.3,
  labelSize: 2.4,
  // 0.5 reproduces the link pull this canvas shipped with (see LINK_FORCE_SCALE).
  linkForce: 0.5,
  linkThickness: 1,
  neighborGlow: true,
  nodeSize: 2.6,
  repulsion: 40,
  rotationSpeed: 0,
  showArrows: false,
  showNames: true,
  showOrphans: true,
  spread: 34,
  textFadeThreshold: 0.5,
};

function sanitizeControls(raw: unknown): GraphControlsState {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_CONTROLS };
  const r = raw as Partial<Record<keyof GraphControlsState, unknown>>;
  const n = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const clamped = (v: unknown, fallback: number, min: number, max: number) => Math.min(max, Math.max(min, n(v, fallback)));
  const b = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

  return {
    dimensions: r.dimensions === 2 ? 2 : 3,
    labelSize: clamped(r.labelSize, DEFAULT_CONTROLS.labelSize, MIN_LABEL_SIZE, MAX_LABEL_SIZE),
    nodeSize: clamped(r.nodeSize, DEFAULT_CONTROLS.nodeSize, MIN_NODE_SIZE, MAX_NODE_SIZE),
    spread: n(r.spread, DEFAULT_CONTROLS.spread),
    repulsion: n(r.repulsion, DEFAULT_CONTROLS.repulsion),
    gravity: n(r.gravity, DEFAULT_CONTROLS.gravity),
    rotationSpeed: n(r.rotationSpeed, DEFAULT_CONTROLS.rotationSpeed),
    showNames: b(r.showNames, DEFAULT_CONTROLS.showNames),
    neighborGlow: b(r.neighborGlow, DEFAULT_CONTROLS.neighborGlow),
    // Settings saved before these existed simply fall back to the defaults.
    linkForce: clamped(r.linkForce, DEFAULT_CONTROLS.linkForce, 0, 1),
    linkThickness: clamped(r.linkThickness, DEFAULT_CONTROLS.linkThickness, MIN_LINK_THICKNESS, MAX_LINK_THICKNESS),
    textFadeThreshold: clamped(r.textFadeThreshold, DEFAULT_CONTROLS.textFadeThreshold, 0, MAX_TEXT_FADE),
    showArrows: b(r.showArrows, DEFAULT_CONTROLS.showArrows),
    showOrphans: b(r.showOrphans, DEFAULT_CONTROLS.showOrphans),
  };
}

export function loadGraphSettings(): GraphControlsState {
  if (typeof window === "undefined") return { ...DEFAULT_CONTROLS };
  try {
    const raw = window.localStorage.getItem(GRAPH_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_CONTROLS };
    return sanitizeControls(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONTROLS };
  }
}

export function saveGraphSettings(controls: GraphControlsState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GRAPH_SETTINGS_KEY, JSON.stringify(controls));
  } catch {
    // Quota/private mode — in-memory controls stay authoritative for the tab.
  }
}
