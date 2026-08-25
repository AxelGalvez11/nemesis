// Asking the server for a picture with its parts found.
//
// 🔴 THE SIBLING OF `occlusion-suggest-api.ts`, AND THE DIFFERENCE IS WHERE THE PICTURE COMES
// FROM. That one uploads a file the learner chose; this one names a SUBJECT and lets the reference
// lane find a licensed picture for it. Everything after that — the vision read, the scale check,
// the boxes — is the same work behind the same shapes.
//
// 🔴 IT NEVER THROWS. A check that could have had a diagram and does not is a smaller check; a
// check that crashes is no check. Every failure path returns null, and the caller carries on with
// whatever the model wrote in words.

import type { SuggestedBox } from "@nemesis/shared";

import { supabase } from "@/lib/supabase";
import { deviceKey } from "@/lib/workspace/chat-api";

import type { LabelledFigure } from "./occlusion-from-labels";

export const FIGURE_OCCLUSION_ROUTE = "/api/learn/figure-occlusion";

/**
 * A repository search plus a vision read on whatever it finds.
 *
 * 🔴 GENEROUS, AND STILL BOUNDED. The server's own `maxDuration` is 60s; a client that gave up at
 * ten would abandon reads it had already paid for, and the learner would see no diagram while the
 * bill arrived anyway.
 */
export const FIGURE_OCCLUSION_TIMEOUT_MS = 45000;

export interface FigureOcclusionDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

const REAL: FigureOcclusionDeps = { fetch: (...args) => globalThis.fetch(...args) };

/** A number that survived the trip, or null. */
function size(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * A licensed picture for `subject`, with the boxes vision found in it — or null.
 *
 * 🔴 THE SHAPE IS RE-CHECKED ON ARRIVAL EVEN THOUGH THE ROUTE IS OUR OWN. A deploy skew must
 * degrade to "no diagram", never to a payload whose width is `undefined` — which would reach
 * `OcclusionCardView` as `viewBox="0 0 undefined undefined"` and render the empty framed box this
 * codebase has already shipped once.
 */
export async function findLabelledFigure(
  subject: string,
  deps: FigureOcclusionDeps = REAL,
  signal?: AbortSignal,
): Promise<LabelledFigure | null> {
  const asked = subject.trim();
  if (!asked) return null;

  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return null;
  const key = await deviceKey(uid);
  if (!key) return null;

  const timeout = new AbortController();
  const deadline = setTimeout(() => timeout.abort(), deps.timeoutMs ?? FIGURE_OCCLUSION_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const response = await deps.fetch(FIGURE_OCCLUSION_ROUTE, {
      body: JSON.stringify({ subject: asked }),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      method: "POST",
      signal: timeout.signal,
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const result = body as Record<string, unknown>;
    if (result.ok !== true || !Array.isArray(result.boxes)) return null;

    const width = size(result.width);
    const height = size(result.height);
    if (!width || !height) return null;

    const asset = typeof result.asset === "object" && result.asset !== null ? (result.asset as Record<string, unknown>) : null;
    const src = asset && typeof asset.assetPath === "string" ? asset.assetPath : "";
    if (!src) return null;

    const caption = asset && typeof asset.caption === "string" && asset.caption.trim() ? asset.caption.trim() : undefined;
    return {
      boxes: result.boxes as SuggestedBox[],
      height,
      src,
      width,
      ...(caption ? { caption } : {}),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener("abort", onAbort);
  }
}
