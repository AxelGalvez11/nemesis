// The learner's OWN figures, offered to a deck.
//
// 🔴 THE POINT OF THE WHOLE FEATURE (owner 2026-08-24, called a priority): a deck built from a
// student's lecture should be able to show the diagram from that lecture. Everything else the
// deck work has done makes slides look good; this is what makes them theirs. A photosynthesis
// deck that draws the Z-scheme their professor drew beats any stock picture ever generated.
//
// 🔴 THE MODEL CHOOSES FROM A MENU; IT NEVER NAMES A PATH. Same border control as
// `plan.references`, and for a stronger reason: a reference the model invents is a wrong
// citation, but a path the model invents is a request for an object in a PRIVATE, owner-scoped
// bucket. So the model sees a numbered list of the canvas's real figures and answers with a
// NUMBER; this file turns numbers back into paths, and a number outside the list is dropped.
//
// 🔴 AND A PATH IS NOT A URL. `library-images` is private and row-level security scopes it by
// the first path segment, which is what keeps one learner's lecture material out of everyone
// else's decks. Nothing is loadable until it is signed for the session asking — see
// `figure-asset-url.ts`, and `signDeckFigures` below.

import type { DeckFigure } from "../export/deck-plan";
import { figureAssetUrl } from "./figure-asset-url";
import { readableCaption } from "./figure-caption";
import type { LearningCanvas } from "./canvas-model";
import { loadCanonicalSource } from "./canvas-sources";
import type { SourceContext } from "@/lib/sources/source-context";

/** How many figures a deck may pick from. A menu is prompt weight, and a lecture with two
 *  hundred pictures would spend more of the brief listing them than teaching from them. */
export const MAX_DECK_FIGURES = 12;

/** How long a caption may run before it stops being a caption. */
const CAPTION_CAP = 160;

/**
 * The figures in one already-loaded source.
 *
 * 🔴 THE DOCUMENT'S OWN CAPTION BEATS THE MODEL'S DESCRIPTION. `source-context.ts` keeps them
 * apart deliberately — *"the caption is what the document says; the description is what a model
 * said about it"* — so a figure printed under a real caption is quoting the lecture, and one
 * printed under a description is quoting a machine. Preferring the caption keeps a slide's
 * provenance true; falling back to the description keeps an uncaptioned diagram usable.
 *
 * A figure with NEITHER is skipped. It could still be drawn, but the model would be choosing
 * from a menu of unlabelled numbers, and a picture nobody can describe is a picture nobody can
 * place on the right slide.
 */
export function figuresFromContext(context: SourceContext, sourceTitle: string): DeckFigure[] {
  const out: DeckFigure[] = [];
  for (const unit of context.units) {
    const figure = unit.figure;
    const path = figure?.asset?.path;
    if (!figure || !path) continue;
    const caption = readableCaption(figure.caption) || readableCaption(figure.description);
    if (!caption) continue;
    out.push({
      caption: caption.slice(0, CAPTION_CAP),
      path,
      source: sourceTitle,
      ...(figure.asset?.width ? { width: figure.asset.width } : {}),
      ...(figure.asset?.height ? { height: figure.asset.height } : {}),
    });
  }
  return out;
}

/**
 * Every figure this canvas can honestly offer, across its filed sources.
 *
 * 🔴 FILED SOURCES ONLY, and that is not a shortcut. A figure lives in storage; a source that
 * was read and never filed (`durability: "ephemeral"`, or an attachment older than filing) has
 * no `librarySourceId` and therefore no stored pixels to point at. Asking for them anyway would
 * mean a menu entry that resolves to nothing.
 *
 * One unreadable source must not cost the deck the rest of them, so a failed load is skipped.
 */
export async function canvasFigures(canvas: LearningCanvas, limit = MAX_DECK_FIGURES): Promise<DeckFigure[]> {
  const filed = canvas.sources.filter((source) => Boolean(source.librarySourceId));
  const found: DeckFigure[] = [];
  const seen = new Set<string>();
  for (const source of filed) {
    if (found.length >= limit) break;
    let loaded;
    try {
      loaded = await loadCanonicalSource(source.librarySourceId as string);
    } catch {
      continue;
    }
    if (!loaded.ok) continue;
    for (const figure of figuresFromContext(loaded.context, source.title)) {
      // The same diagram on a lecture's summary and its recap slide is one picture; the asset
      // store already converged them on one path, so the menu should not list it twice.
      if (seen.has(figure.path)) continue;
      seen.add(figure.path);
      found.push(figure);
      if (found.length >= limit) break;
    }
  }
  return found;
}

/**
 * The menu the model is shown, and the only place figures are named to it.
 *
 * Numbered from 1 because the plan's `figure` field is 1-based and 0 means "no figure" — an
 * off-by-one here would put the wrong lecture diagram on the slide, which is worse than putting
 * none, because it looks deliberate.
 */
export function figureMenu(figures: readonly DeckFigure[]): string {
  if (!figures.length) return "";
  const lines = figures.map((figure, i) => `${i + 1}. ${figure.caption}  (from: ${figure.source})`);
  return [
    "Figures available from the learner's own material. To put one on a slide, set that slide's",
    '"figure" to its number below. Use a figure only where it genuinely illustrates that slide —',
    'most slides should have none, which is "figure": 0. Never invent a figure that is not listed.',
    "",
    ...lines,
  ].join("\n");
}

/**
 * The same figures with a loadable URL on each.
 *
 * 🔴 SIGNED AT RENDER TIME, NEVER STORED. The plan is saved on the canvas output and rebuilt
 * whenever anyone opens or downloads the deck; a signed URL lives an hour (see
 * `FIGURE_URL_TTL_SECONDS`). Baking one into the saved plan would produce a deck that showed its
 * diagrams on the day it was made and empty frames a week later.
 *
 * A figure that cannot be signed keeps its caption and loses its picture — the slide then prints
 * the caption and the source, which is a poorer slide and an honest one. Same bargain as a
 * background texture that fails to load.
 */
export async function signDeckFigures(figures: readonly DeckFigure[]): Promise<DeckFigure[]> {
  return Promise.all(
    figures.map(async (figure) => {
      const url = await figureAssetUrl(figure.path);
      return url ? { ...figure, url } : { ...figure };
    }),
  );
}
