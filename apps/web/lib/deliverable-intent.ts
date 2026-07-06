// Deliverable-intent detector — pure, deterministic, no LLM. Detects when a typed message is a
// COMMAND to produce a named artifact ("make me slides on X", "write a document about Y",
// "make a poster on Z") rather than a normal research question ("what does the evidence say about
// X?", "is there a review of Y?", "summarize the report on Z"). Gated behind
// NEXT_PUBLIC_DELIVERABLES_ON_COMMAND at the call site (apps/web/app/app/ask/page.tsx) — this module
// itself has no env dependency so it stays a pure function that's trivially unit-testable.
//
// FAIL-SAFE BY DESIGN: the discriminator is grammatical, not keyword-based. A deliverable request
// has a LEADING imperative verb (make/create/build/draft/write/generate — optionally after a polite
// prefix like "can you"/"please") immediately followed by an optional subject ("me"/"us") and a
// format noun (slides/deck/presentation/document/report/write-up/paper/poster). A question that only
// MENTIONS a format noun ("what does the latest paper say about statins?", "is there a good review
// of GLP-1 safety?") does NOT match — there is no leading command verb governing the noun. When in
// doubt, isDeliverable is false and the caller must treat the message as a normal question.
export type DeliverableFormat = "slides" | "document" | "poster";

export interface DeliverableIntent {
  isDeliverable: boolean;
  format: DeliverableFormat | null;
  /** The message with the deliverable directive stripped, e.g. "statin safety". Empty string when
   *  isDeliverable is false, or when stripping would leave nothing (fail-safe: treated as non-match). */
  topic: string;
}

const NOT_DELIVERABLE: DeliverableIntent = { isDeliverable: false, format: null, topic: "" };

// Imperative verbs that can head a deliverable command.
const VERB = "(?:make|create|build|draft|write|generate|prepare|put together)";
// Optional polite prefix ("can you", "could you", "please", "i need", "i want", combinations thereof).
const PREFIX = "(?:^|^(?:hey\\s+)?(?:can|could|would)\\s+you\\s+|^please\\s+|^i(?:'d|\\s+would)?\\s+(?:like|want|need)\\s+(?:you\\s+to\\s+)?|^i\\s+need\\s+)";
// Optional subject between verb and format noun ("me", "us", "me a", "me some", "a", "some", "an").
const SUBJECT = "(?:me|us)?\\s*(?:a|an|some)?\\s*";

// Format noun groups. Order matters only for readability; matching is independent per group.
// Longest alternatives first so "slide deck" consumes both words, not just "slide" (leaving "deck"
// stuck at the front of the captured topic).
const SLIDES_NOUNS = "(?:slide\\s*decks?|slides?|decks?|presentations?|powerpoints?|ppts?)";
const POSTER_NOUNS = "(?:conference\\s+posters?|posters?)";
// DOCUMENT nouns deliberately EXCLUDE bare "report"/"paper" as a trailing noun with no other
// qualifier — those overlap too heavily with normal research questions ("write a report on...",
// "summarize the report on..."). We still allow "document", "write-up"/"writeup", and the explicit
// "research paper"/"research document" phrasing, which are unambiguous artifact requests.
const DOCUMENT_NOUNS = "(?:documents?|write-?ups?|research\\s+(?:paper|document)s?)";

interface FormatRule {
  format: DeliverableFormat;
  nounPattern: string;
}

const FORMAT_RULES: FormatRule[] = [
  { format: "poster", nounPattern: POSTER_NOUNS },
  { format: "slides", nounPattern: SLIDES_NOUNS },
  { format: "document", nounPattern: DOCUMENT_NOUNS },
];

function buildRegex(nounPattern: string): RegExp {
  // Captures: (1) everything before the matched directive is discarded (we anchor near start),
  // (2) the "on"/"about"/"for"/":" separator before the topic, (3) the topic itself (rest of string).
  return new RegExp(
    `${PREFIX}${VERB}\\s+${SUBJECT}${nounPattern}\\b(?:\\s+(?:on|about|for|regarding|covering|:))?\\s*(.*)$`,
    "i",
  );
}

const FORMAT_REGEXES: Array<{ format: DeliverableFormat; re: RegExp }> = FORMAT_RULES.map((r) => ({
  format: r.format,
  re: buildRegex(r.nounPattern),
}));

export function detectDeliverableIntent(raw: string): DeliverableIntent {
  const text = raw.trim();
  if (!text) return NOT_DELIVERABLE;

  for (const { format, re } of FORMAT_REGEXES) {
    const m = re.exec(text);
    if (!m) continue;
    const topic = (m[1] ?? "").trim().replace(/[.?!]+$/, "").trim();
    if (!topic) return NOT_DELIVERABLE; // fail-safe: "make me slides" with no subject isn't a deliverable
    return { isDeliverable: true, format, topic };
  }

  return NOT_DELIVERABLE;
}
