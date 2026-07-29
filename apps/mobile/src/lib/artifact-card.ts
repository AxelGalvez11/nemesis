// How a thing the chat CREATED reads as a card in the transcript.
//
// Owner 2026-07-27: "any chat flashcards, tests, or notes that were created
// should not have the raw text output into chat but rather as a card/text
// artifact in chat that routes user to the location of it."
//
// The wire half of this already worked — every creating tool returns an
// `artifact` (api/agentTools.ts), api/chat.ts turns it into a ChatOutput and
// drops the model's prose copy, and the chip row routes on tap. What the
// student actually SAW was a bare pill reading "Deck created": no name, no
// destination, identical for the deck they just made and the one before it.
// So the deliverable existed and was unrecognisable.
//
// This module is the pure half — what the card SAYS. PURE so the two things
// that are easy to get wrong are testable without a device:
//
//   1. A deck's stored name carries its folder as "Pharmacology::Cardiology"
//      (there is no separate group entity server-side — see agent-tools.ts
//      matchDeckName). Printed raw, the card shows the student an encoding
//      they never typed. The folder is real information though, so it becomes
//      the destination line rather than being thrown away.
//   2. Notes, slide decks and calendar events all arrive as kind "other",
//      because the kind union is shared with web's SessionOutput and widening
//      it would mean a note silently failing web's allowlist. Their route
//      already says what they are, so the label is read off that instead.

import type { ChatOutput } from "./chat-thread.ts";

export interface ArtifactCard {
  /** What kind of thing this is: "Flashcard deck", "Note", … */
  kicker: string;
  /** What it is called, with any folder encoding removed. */
  title: string;
  /** Where tapping it goes: "Study · Pharmacology", "Library", … */
  where: string;
  /** Just the surface it lives on — "Study", "Library", "Calendar" or "" — for
   *  buttons that need "Open in X" without the folder half. */
  place: string;
  /** Whether tapping navigates. False = the card opens a preview sheet, which
   *  is the recording case: audio has no page of its own to land on. */
  opens: boolean;
}

/** Deck names use Anki's "A::B::Leaf" convention. Blank segments are dropped so
 *  a malformed "A :: :: B" still reads as A → B. */
function segments(name: string): string[] {
  return name.split("::").map((part) => part.trim()).filter(Boolean);
}

/** The bit before the "?" — the route without its query, which is all the
 *  labelling below needs and is stable if a param is ever added. */
function routePath(route: string | undefined): string {
  if (!route) return "";
  const cut = route.indexOf("?");
  return cut === -1 ? route : route.slice(0, cut);
}

/** The folder a test or mind map was filed into, which api/agentTools.ts puts
 *  in the route's `group` param. It cannot come from the title the way a deck's
 *  does — a Study artifact's folder is a separate column — and it cannot be a
 *  new ChatOutput field either, because `meta.outputs` is shared with web.
 *  Hand-parsed rather than via URLSearchParams: these are Expo route strings,
 *  not URLs, and `new URL("/study?…")` throws without a base. */
function routeGroup(route: string | undefined): string {
  const match = /[?&]group=([^&]*)/.exec(route ?? "");
  if (!match?.[1]) return "";
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    // A malformed escape must not take the whole card down with it.
    return "";
  }
}

/** What an "other" artifact really is, read off its destination. Everything the
 *  phone files under "other" today lands on a distinct route, so this is a
 *  lookup rather than a guess; anything genuinely unknown says "Saved" instead
 *  of inventing a category. */
function otherKicker(route: string | undefined): string {
  switch (routePath(route)) {
    case "/note":
      return "Note";
    case "/slides":
      return "Slides";
    case "/calendar":
      return "Calendar event";
    default:
      return "Saved";
  }
}

const KICKER: Record<ChatOutput["kind"], string> = {
  flashcards: "Flashcard deck",
  mindmap: "Mind map",
  other: "Saved",
  recording: "Recording",
  report: "Report",
  slides: "Slides",
  test: "Practice test",
};

/** The destination, phrased as a place rather than a path. `folder` is the
 *  deck's own folder when it has one — a deck is the only artifact that carries
 *  its location in its title; a test or mind map carries it in the route. */
function destination(kind: ChatOutput["kind"], route: string | undefined, folder: string): string {
  const path = routePath(route);
  if (kind === "recording") return path === "/note" ? "Library" : "Tap to read";
  if (path === "/note" || path === "/slides") return "Library";
  if (path === "/calendar") return "Calendar";
  if (path !== "/study") return route ? "Tap to open" : "Tap to read";
  if (kind === "flashcards") return folder ? `Study · ${folder}` : "Study · Cards";
  const group = routeGroup(route);
  if (kind === "test") return group ? `Study · ${group}` : "Study · Tests";
  if (kind === "mindmap") return group ? `Study · ${group}` : "Study · Mind maps";
  return "Study";
}

/** The surface alone, with any folder trimmed off — "Study · Pharmacology"
 *  becomes "Study". Empty when there is nowhere to go. */
function place(where: string): string {
  if (where.startsWith("Tap ")) return "";
  const cut = where.indexOf(" · ");
  return cut === -1 ? where : where.slice(0, cut);
}

export function artifactCard(output: ChatOutput): ArtifactCard {
  const raw = output.title.trim();
  // Only decks encode a folder in the name. Doing this to every title would
  // mangle a note legitimately called "Ratios :: a refresher".
  const parts = output.kind === "flashcards" ? segments(raw) : [];
  const title = parts.length ? (parts[parts.length - 1] as string) : raw;
  const folder = parts.length > 1 ? parts.slice(0, -1).join(" · ") : "";
  const where = destination(output.kind, output.route, folder);
  return {
    kicker: output.kind === "other" ? otherKicker(output.route) : KICKER[output.kind],
    opens: Boolean(output.route),
    place: place(where),
    // An artifact with no title is a bug upstream, but a blank card is worse
    // than a generic one — fall back to what it is.
    title: title || KICKER[output.kind],
    where,
  };
}
