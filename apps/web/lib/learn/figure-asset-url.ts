// Turning a stored figure's path into something an <img> can actually load.
//
// WHY THIS IS NOT JUST A URL CONCATENATION. The visual-assets bucket is PRIVATE. Its
// objects are owner-scoped by path (`<uid>/figures/<hash>.png`) and row-level security
// refuses anyone else, which is exactly what we want for a learner's own lecture
// material — and it means there is no public URL to build. The picture is reachable
// only through a signed link, minted for the session that asks for it.
//
// 🔴 THE FAILURE THIS REPLACES. The spatial lane passed `imageRef` — the document's own
// name for the figure, e.g. `ppt/media/image3.png` — straight into `<img src>`. Relative
// to the page, that asks the application for `/learn/ppt/media/image3.png`, which has
// never existed. The browser renders a broken image; nothing throws; no test fails. A
// learner mid-question sees an empty frame where the diagram should be.
//
// 🔴 AND A FAILURE TO SIGN MUST STAY NULL. Returning a placeholder or the raw path would
// put that same broken frame back. Null means "there is no picture to show", the caller
// renders no diagram, and the question stands on its own text — which is a worse question
// but an honest screen.

import { supabase } from "@/lib/supabase";

/** Where figure assets live. Must match the ingestion side (`figure-assets.ts`). */
export const FIGURE_ASSET_BUCKET = "library-images";

/**
 * How long a link lives.
 *
 * An hour comfortably outlasts one canvas session while keeping a leaked URL short-lived.
 * The picture is re-signed on the next render, so a long-running tab recovers by itself.
 */
export const FIGURE_URL_TTL_SECONDS = 3_600;

/**
 * A displayable URL for one stored figure, or null.
 *
 * Null on every failure — no path, no session, storage refused — because each one means
 * the same thing to the surface: there is nothing to render.
 */
export async function figureAssetUrl(path: string | undefined): Promise<string | null> {
  if (!path?.trim()) return null;
  try {
    const { data, error } = await supabase.storage
      .from(FIGURE_ASSET_BUCKET)
      .createSignedUrl(path, FIGURE_URL_TTL_SECONDS);
    if (error) return null;
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * Is this string an object path rather than something already loadable?
 *
 * 🔴 EXISTS TO CATCH THE OLD MISTAKE BY ITS SHAPE. A parser's figure key
 * (`ppt/media/image3.png`, `/Figure0`) and a stored asset path
 * (`<uid>/figures/<hash>.png`) are both "some/thing/with/slashes", so a caller that
 * confuses them produces a request that looks reasonable and 404s. Anything already
 * carrying a scheme is loadable as-is; anything else has to be signed before it can be
 * shown, and a caller that skips signing gets a broken image rather than an error. PURE.
 */
export function needsSigning(value: string): boolean {
  return !/^(https?:|data:|blob:)/i.test(value.trim());
}
