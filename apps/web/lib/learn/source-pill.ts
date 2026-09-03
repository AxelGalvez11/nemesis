// What a citation becomes when it stops being grey text and turns into something you can press.
//
// 🔴 THE REPORTED SHAPE, 2026-08-20: *"should a have pill sources like chatgpt and sources should
// have small circle favicon thumbnails, users should be able to click on the sources linked to the
// webpage or if its a document then users should see a popup preview of the doc."*
//
// 🔴🔴 TWO KINDS, AND THE DIFFERENCE IS NOT COSMETIC — IT IS WHERE PRESSING IT CAN GO. A page has an
// address, so the pill is a link and the browser does the rest. An uploaded document has no address
// anywhere: `CanvasSource.sourceUrl` is documented as absent for every file upload, and absent means
// "not a link", never "the URL was lost". There is nowhere to send that learner, so the only honest
// answer is to show them the passage the claim came from — which the canvas already holds, because
// `quotedExcerpt` resolves it out of the source's own excerpt list.
//
// 🔴 A UNION RATHER THAN AN OPTIONAL `url`, FOR THE REASON THIS FILE'S NEIGHBOURS USE UNIONS. A
// `{ url?: string; excerpt?: string }` record compiles with neither set, and the renderer would
// then have to invent a third behaviour for a pill that is neither a link nor a preview — which is
// exactly the "dead control" shape this codebase keeps finding. Every value here can be pressed.
//
// PURE. No React, no I/O. What a source IS gets decided here; what it looks like is the component's.

import { quotedExcerpt } from "./canvas-grounding";
import type { CanvasSource, SourceRef } from "./canvas-model";

export type SourcePill =
  /** A live page. Pressing it opens the page. */
  | {
      kind: "web";
      /** What the pill says. The site's short name, never the full URL. */
      label: string;
      /** The host, for the favicon service. */
      host: string;
      url: string;
      /** The document title and section, for the tooltip. */
      title: string;
    }
  /**
   * Something the learner uploaded. Pressing it shows the passage.
   *
   * 🔴 `excerpt` MAY BE EMPTY AND THE PILL STILL EXISTS. A citation whose excerpt has been lost to a
   * reparse still names a real document the learner recognises; refusing the pill there would take
   * away the provenance to protect the preview. The renderer says so instead.
   */
  | {
      kind: "document";
      label: string;
      title: string;
      section: string | null;
      excerpt: string;
      /**
       * The durable `library_sources.id`, when this document was filed.
       *
       * 🔴 ADDED SO THE PILL CAN OPEN THE REAL READER, AND NULL IS A REAL STATE. The excerpt alone
       * was the only honest destination while there was no source viewer; there is one now, and it
       * needs the id `CanvasSource.librarySourceId` carries. That field is ABSENT for every
       * ephemeral attachment and for anything uploaded before filing existed, so null here means
       * "this document was never filed, show the passage" — never "the id has not loaded yet".
       */
      librarySourceId: string | null;
    };

/** Leading host labels that name a mirror or a language rather than the source. Kept in step with
 *  `lib/favicon.ts`, which does the same job for the chat surface. */
const GENERIC = new Set(["www", "en", "m", "amp", "mobile"]);

/** `en.wikipedia.org` -> `Wikipedia`. Returns null when there is no usable host. */
function siteName(url: string): { host: string; label: string } | null {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  if (!host) return null;
  const part = host.split(".").filter((piece) => !GENERIC.has(piece))[0];
  if (!part) return null;
  return { host, label: part.charAt(0).toUpperCase() + part.slice(1) };
}

/**
 * One citation, resolved into something pressable — or `null`.
 *
 * 🔴🔴 `null` IS A REFUSAL AND MUST REACH THE SURFACE AS SILENCE. `knowledge-citation.ts` already
 * argues this at length for the layer above: a citation the learner could follow and find nothing
 * behind is worse than no citation. The same rule holds one layer down. A ref naming a source this
 * canvas does not hold produces nothing here, and the renderer draws nothing — never a greyed-out
 * pill, never "source unknown".
 */
export function sourcePill(
  sources: readonly CanvasSource[],
  citation: { ref: SourceRef; sourceTitle: string; label?: string | null },
): SourcePill | null {
  const source = sources.find((candidate) => candidate.id === citation.ref.sourceId);
  if (!source) return null;

  const title = citation.sourceTitle.trim() || source.title.trim();
  if (!title) return null;
  const section = (citation.label ?? "").trim() || null;

  // 🔴 THE PAGE'S OWN ADDRESS, NOT `librarySourceId`. That field names a row in OUR storage and is
  // not a page anywhere; a pill built on it would link the learner into nothing. `canvas-model.ts`
  // states the distinction on the field itself.
  const quoted = quotedExcerpt(sources, citation.ref);
  const excerpt = (quoted?.excerpt.text ?? "").trim();

  const url = (source.sourceUrl ?? "").trim();
  if (url) {
    const site = siteName(url);
    if (site) {
      // 🔴 A PAGE OPENS. IT DOES NOT COME INTO THE READING PANE. Owner reversed the earlier call
      // on 2026-08-30: the pane is for documents. A page already has a home — the browser — and
      // pulling it into a 360px column gives a worse read than the site it came from.
      return { host: site.host, kind: "web", label: site.label, title: section ? `${title} · ${section}` : title, url };
    }
  }

  return {
    excerpt,
    kind: "document",
    librarySourceId: source.librarySourceId ?? null,
    // 🔴 THE DOCUMENT'S OWN NAME IS THE LABEL. A learner recognises "PHCY 2119 Lecture 4"; they do
    // not recognise a section heading out of context, which is why the section rides in the preview
    // rather than on the face of the pill.
    label: title,
    section,
    title: section ? `${title} · ${section}` : title,
  };
}

/**
 * Every citation on screen, resolved and de-duplicated.
 *
 * 🔴 DE-DUPLICATED BY WHAT THE LEARNER WOULD PRESS, NOT BY THE ANCHOR. Two anchors into the same
 * page are one pill: showing the site twice presents a single source as corroboration, which is the
 * same argument `citationsForKnowledge` makes about excerpts one level up. Two anchors into
 * different excerpts of the same DOCUMENT are also one pill, because the pill opens the document.
 */
export function sourcePills(
  sources: readonly CanvasSource[],
  citations: readonly { ref: SourceRef; sourceTitle: string; label?: string | null }[],
): SourcePill[] {
  const seen = new Set<string>();
  const pills: SourcePill[] = [];
  for (const citation of citations) {
    const pill = sourcePill(sources, citation);
    if (!pill) continue;
    const key = pill.kind === "web" ? `web:${pill.url}` : `doc:${pill.label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pills.push(pill);
  }
  return pills;
}

/**
 * The only kind of source that opens in the docked reader.
 *
 * 🔴 A TYPE, NOT A CONVENTION. Owner, 2026-08-30: the reader is for documents; a web citation opens
 * the page in the browser. Narrowing here means a web pill cannot reach `openPill` at all, so the
 * rule cannot be undone by someone wiring up a call site without reading this file.
 *
 * 🔴 IT LIVED IN `source-tabs.ts` UNTIL 2026-09-03, and that file is gone. It held the tab state of
 * a second reading pane that a citation chip used to open; the chip opens the header's Sources
 * panel now (see `document-dock.tsx`), so the store, its six exported functions and its tests went
 * with the pane. This one type was the only part still in use, and it belongs beside the union it
 * narrows rather than in a file named for a surface that no longer exists.
 */
export type DocumentPill = Extract<SourcePill, { kind: "document" }>;
