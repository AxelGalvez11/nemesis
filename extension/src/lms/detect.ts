// Which school portal is this page?
//
// PURE. Takes a description of the page, returns a verdict. No DOM access here
// so the whole thing is testable with plain fixtures.
//
// WHY URL SHAPE AND NOT CSS CLASSES. The obvious way to recognise Canvas is to
// look for its markup. That breaks immediately in the real world: every
// university themes its portal, renames classes, injects wrappers, and runs a
// version six months behind the next university. What none of them change is
// the ROUTING — a Canvas course is at /courses/:id everywhere on earth, because
// that is the application's own URL contract and links inside the product
// depend on it. So detection leans on paths first and treats markup as a
// tiebreak.
//
// "unknown" is a real answer and the default. A page we cannot place scans to
// nothing, which is a better outcome than confidently parsing a bank website.

import type { LmsKind } from "../wire.ts";

/** Everything detection is allowed to look at. Assembled by the thin DOM
 *  adapter; see dom.ts. */
export interface PageFacts {
  url: string;
  /** Lowercased hostname, split out so tests do not have to parse. */
  host: string;
  /** Path with its query string, lowercased. */
  path: string;
  /** Cheap markup tells: meta generator, well-known element ids, script hosts.
   *  Lowercased by the adapter. */
  markers: readonly string[];
}

/**
 * Path patterns that identify a portal regardless of how it is themed.
 *
 * Each is anchored at a path segment boundary so a marketing page at
 * /about/courses does not read as a Canvas course listing.
 */
const PATH_SIGNS: ReadonlyArray<{ kind: LmsKind; pattern: RegExp }> = [
  // Canvas: /courses, /courses/123, /courses/123/assignments
  { kind: "canvas", pattern: /^\/courses(?:\/\d+)?(?:\/|$|\?)/ },
  // Canvas dashboard and its API, both distinctive.
  { kind: "canvas", pattern: /^\/(?:dashboard|api\/v1\/courses)(?:\/|$|\?)/ },
  // Blackboard Ultra and the older "webapps" stack. The _123_1 course-id shape
  // is Blackboard's own and appears nowhere else.
  { kind: "blackboard", pattern: /^\/ultra(?:\/|$)/ },
  { kind: "blackboard", pattern: /^\/webapps\// },
  { kind: "blackboard", pattern: /_\d+_1(?:\/|$|&|\?)/ },
  // Moodle routes everything through view.php under a module folder.
  { kind: "moodle", pattern: /^\/course\/view\.php/ },
  { kind: "moodle", pattern: /^\/my\/?(?:\?|$)/ },
  { kind: "moodle", pattern: /^\/mod\/[a-z]+\/view\.php/ },
  // Brightspace namespaces its entire application under /d2l.
  { kind: "brightspace", pattern: /^\/d2l\// },
];

/** Hostname fragments used by the vendors' own hosting. A university on
 *  canvas.university.edu is not covered by these and is caught by path shape
 *  instead — which is the point of having both. */
const HOST_SIGNS: ReadonlyArray<{ kind: LmsKind; fragment: string }> = [
  { fragment: "instructure.com", kind: "canvas" },
  { fragment: "blackboard.com", kind: "blackboard" },
  { fragment: "blackboardcdn.com", kind: "blackboard" },
  { fragment: "moodlecloud.com", kind: "moodle" },
  { fragment: "brightspace.com", kind: "brightspace" },
  { fragment: "desire2learn.com", kind: "brightspace" },
];

/** Markup tells, used only to confirm. Deliberately generic strings that the
 *  applications emit about themselves rather than themeable class names. */
const MARKER_SIGNS: ReadonlyArray<{ kind: LmsKind; fragment: string }> = [
  { fragment: "instructure", kind: "canvas" },
  { fragment: "canvas-lms", kind: "canvas" },
  { fragment: "blackboard", kind: "blackboard" },
  { fragment: "moodle", kind: "moodle" },
  { fragment: "brightspace", kind: "brightspace" },
  { fragment: "d2l", kind: "brightspace" },
];

/**
 * Best guess at which portal this is. PURE.
 *
 * Host beats path beats markup. A host match is close to proof — nobody else
 * serves instructure.com. Path shape is strong but can collide with an ordinary
 * site that happens to have /courses, so a marker agreeing with it raises
 * confidence without being required.
 */
export function detectLms(facts: PageFacts): LmsKind {
  const host = facts.host.toLowerCase();
  for (const sign of HOST_SIGNS) {
    // Anchored at a DOTTED LABEL boundary, not a substring. A bare endsWith
    // lets "notinstructure.com" pass as Canvas, which is exactly how a
    // lookalike domain gets a content script it should never have had.
    if (host === sign.fragment || host.endsWith(`.${sign.fragment}`)) return sign.kind;
  }

  const path = facts.path.toLowerCase();
  for (const sign of PATH_SIGNS) {
    if (sign.pattern.test(path)) return sign.kind;
  }

  // Nothing in the routing. Markup alone is weak evidence, so it only counts
  // when a marker names the product outright.
  const markers = facts.markers.map((marker) => marker.toLowerCase());
  for (const sign of MARKER_SIGNS) {
    if (markers.some((marker) => marker.includes(sign.fragment))) return sign.kind;
  }

  return "unknown";
}

/** Split a URL into the shape detection wants. Returns null for anything
 *  unparseable, which callers treat as "not a portal". PURE. */
export function factsFromUrl(url: string, markers: readonly string[] = []): PageFacts | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return {
    host: parsed.hostname.toLowerCase(),
    markers,
    path: `${parsed.pathname}${parsed.search}`.toLowerCase(),
    url: parsed.toString(),
  };
}
