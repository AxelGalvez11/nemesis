// Pure selection math for the Library sidebar's multi-select (shift range +
// cmd/ctrl toggle). DOM-free so it stays unit-testable — the tree view passes
// in the visible row order (document order of the rendered rows).

/** Cmd/Ctrl-click: flip one key in or out of the selection. */
export function toggleSelectionKey(selected: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(selected);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/** Shift-click: contiguous span between the anchor and the clicked row, in
 *  visible order. Falls back to just the clicked row when the anchor is gone
 *  (e.g. its folder collapsed). */
export function rangeSelectionKeys(
  orderedKeys: readonly string[],
  anchorKey: string | null,
  targetKey: string,
): Set<string> {
  const anchor = anchorKey ?? targetKey;
  const from = orderedKeys.indexOf(anchor);
  const to = orderedKeys.indexOf(targetKey);
  if (to === -1) return new Set([targetKey]);
  if (from === -1) return new Set([targetKey]);
  return new Set(orderedKeys.slice(Math.min(from, to), Math.max(from, to) + 1));
}
