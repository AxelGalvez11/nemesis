// Serializing a tool result for the model, without ever lying about how much of
// it came back.
//
// Why this exists (owner 2026-08-05, acceptance test 3): the loop used to send
// `JSON.stringify(result).slice(0, 20_000)`. A 92-event calendar range came back
// as `{"complete":true,"count":92,"events":[…` cut dead at character 20,000 —
// invalid JSON, mid-object, still carrying its own claim that it was complete.
// The agent only recovered because `count` happened to disagree with what it
// could parse. That is exactly the "make the LLM infer whether the backend
// omitted data" failure the owner banned.
//
// So: a result either fits, or it comes back as VALID JSON that says
// `"complete": false`, how many rows were dropped, and where to resume.

/** Matches the per-result ceiling the agent loop has always used. */
export const TOOL_RESULT_CHAR_BUDGET = 20_000;

/** Fields a caller can page on, best first — used to tell the model where to
 *  pick up. Date beats path beats name because ranges are the common case. */
const CURSOR_KEYS = ["date", "path", "name", "title", "id"] as const;

function cursorOf(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  for (const key of CURSOR_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

/** The longest array field on the object, which is what actually blew the
 *  budget — every oversized tool result we have is one big list plus counters. */
function widestArrayField(result: Record<string, unknown>): { key: string; rows: unknown[] } | null {
  let best: { key: string; rows: unknown[] } | null = null;
  for (const [key, value] of Object.entries(result)) {
    if (!Array.isArray(value)) continue;
    if (!best || value.length > best.rows.length) best = { key, rows: value };
  }
  return best && best.rows.length > 0 ? best : null;
}

/**
 * `result` as JSON the model can parse, never longer than `budget`.
 *
 * Under budget: the exact serialization, untouched. Over budget: as many rows as
 * fit, `complete: false` (overriding whatever the tool claimed), and a
 * `truncated` block giving the true total, how many were dropped, and the cursor
 * to resume from. Falls back to a small honest object if even that will not fit.
 */
export function serializeToolResult(result: unknown, budget: number = TOOL_RESULT_CHAR_BUDGET): string {
  const full = JSON.stringify(result ?? null);
  if (full.length <= budget) return full;

  if (result && typeof result === "object" && !Array.isArray(result)) {
    const record = result as Record<string, unknown>;
    const widest = widestArrayField(record);
    if (widest) {
      const { key, rows } = widest;
      // Largest prefix that fits. Linear from a halving probe would still need a
      // final walk, so binary-search the row count directly.
      let low = 0;
      let high = rows.length;
      let bestFit = "";
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const kept = rows.slice(0, mid);
        const candidate = JSON.stringify({
          ...record,
          [key]: kept,
          complete: false,
          truncated: {
            field: key,
            omitted: rows.length - kept.length,
            resume_after: cursorOf(kept[kept.length - 1]),
            returned: kept.length,
            total: rows.length,
          },
        });
        if (candidate.length <= budget) {
          bestFit = candidate;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      if (bestFit) return bestFit;
    }
  }

  return JSON.stringify({
    complete: false,
    truncated: {
      note: "This result was too large to return. Ask again for a narrower range or a single folder.",
      total_chars: full.length,
    },
  });
}
