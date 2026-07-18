// Graph controls state — verbatim constants from desktop graph/index.tsx §B.3.
// Persisted to localStorage["nemesis.graph.settings.v1"].

export const GRAPH_SETTINGS_KEY = "nemesis.graph.settings.v1";
export const MIN_NODE_SIZE = 4;
export const MIN_LABEL_SIZE = 4;
export const MAX_LABEL_SIZE = 24;

export interface GraphControlsState {
  labelSize: number;
  nodeSize: number;
  spread: number;
  repulsion: number;
  gravity: number;
  rotationSpeed: number;
  showNames: boolean;
  neighborGlow: boolean;
}

export const DEFAULT_CONTROLS: GraphControlsState = {
  gravity: 0.3,
  labelSize: 8,
  neighborGlow: true,
  nodeSize: 7,
  repulsion: 40,
  rotationSpeed: 0,
  showNames: true,
  spread: 34,
};

function sanitizeControls(raw: unknown): GraphControlsState {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_CONTROLS };
  const r = raw as Partial<Record<keyof GraphControlsState, unknown>>;
  const n = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const b = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

  return {
    labelSize: n(r.labelSize, DEFAULT_CONTROLS.labelSize),
    nodeSize: n(r.nodeSize, DEFAULT_CONTROLS.nodeSize),
    spread: n(r.spread, DEFAULT_CONTROLS.spread),
    repulsion: n(r.repulsion, DEFAULT_CONTROLS.repulsion),
    gravity: n(r.gravity, DEFAULT_CONTROLS.gravity),
    rotationSpeed: n(r.rotationSpeed, DEFAULT_CONTROLS.rotationSpeed),
    showNames: b(r.showNames, DEFAULT_CONTROLS.showNames),
    neighborGlow: b(r.neighborGlow, DEFAULT_CONTROLS.neighborGlow),
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
