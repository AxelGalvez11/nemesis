export const DEFAULT_EVIDENCE_PANEL_WIDTH = 344;
export const MIN_EVIDENCE_PANEL_WIDTH = 320;
export const MAX_EVIDENCE_PANEL_WIDTH = 720;

export function clampEvidencePanelWidth(width: number, viewportWidth = 1440): number {
  if (!Number.isFinite(width)) return DEFAULT_EVIDENCE_PANEL_WIDTH;
  const viewportCap = Math.max(MIN_EVIDENCE_PANEL_WIDTH, Math.floor(viewportWidth * 0.72));
  const max = Math.min(MAX_EVIDENCE_PANEL_WIDTH, viewportCap);
  return Math.min(max, Math.max(MIN_EVIDENCE_PANEL_WIDTH, Math.round(width)));
}

export function evidencePanelWidthStyle(width: number): string {
  return `${clampEvidencePanelWidth(width)}px`;
}
