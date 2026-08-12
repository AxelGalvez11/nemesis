// The source-routing acceptance set.
//
// Owner 2026-08-06: "Treat unnecessary web search as an agent-quality defect,
// not harmless extra behavior." So this file is the specification, not a
// convenience: every case names the sources a turn is ENTITLED to and the ones
// it must not touch, and the suite scores the engine against it.
//
// 🔴 THE CASES ARE FIELD-AGNOSTIC ON PURPOSE. Nemesis serves a law student and
// a mechanical-engineering student equally (CLAUDE.md), and a routing rule that
// only reads correctly for one subject is the exact failure mode this work
// exists to remove. Every behaviour below appears at least twice in unrelated
// disciplines, so a fix that generalises passes and a keyword patch does not.

/** Where an answer's information is allowed to come from.
 *
 *  `required` and `forbidden` are the assertions; `allowed` means the case is
 *  not about that source and scoring must ignore it. A table where everything
 *  is required or forbidden is a table that has stopped describing reality. */
export type SourceExpectation = "required" | "forbidden" | "allowed";

export interface RoutingCase {
  /** What the student types. */
  ask: string;
  /** The live web (Tavily, through nemesis-search). */
  web: SourceExpectation;
  /** The student's OWN material: Library notes, sources, recordings. */
  library: SourceExpectation;
  /** Calendar, syllabus and course schedule. */
  schedule: SourceExpectation;
  /** Why this case is here. Read as the rationale in a failure report. */
  why: string;
  /** Set on the six the owner wrote out by hand. These may never regress. */
  hard?: true;
}

export const ROUTING_CASES: RoutingCase[] = [
  // ── the owner's six hard requirements ──────────────────────────────────────
  {
    ask: "who are you?",
    hard: true,
    library: "forbidden",
    schedule: "forbidden",
    web: "forbidden",
    why: "Identity. Nemesis knows what it is; no source can improve the answer.",
  },
  {
    ask: "What is photosynthesis?",
    hard: true,
    library: "allowed",
    schedule: "forbidden",
    web: "forbidden",
    why: "Settled textbook knowledge. Searching it is pure latency and cost.",
  },
  {
    ask: "What did lecture 7 say about Km?",
    hard: true,
    library: "required",
    schedule: "forbidden",
    web: "forbidden",
    why: "A question about the student's own lecture. The web cannot answer it at all.",
  },
  {
    ask: "When is my next exam?",
    hard: true,
    library: "allowed",
    schedule: "required",
    web: "forbidden",
    why: "Their calendar/syllabus holds the answer. 'next' is not a news word.",
  },
  {
    ask: "What is the latest FDA guidance on semaglutide?",
    hard: true,
    library: "allowed",
    schedule: "forbidden",
    web: "required",
    why: "Guidance changes and is external. Answering from memory risks being a year stale.",
  },
  {
    ask: "Compare what my professor taught with the current guideline",
    hard: true,
    library: "required",
    schedule: "forbidden",
    web: "required",
    why: "The comparison needs BOTH halves. Either alone answers a different question.",
  },

  // ── no tool at all ─────────────────────────────────────────────────────────
  {
    ask: "Explain active recall",
    library: "allowed",
    schedule: "forbidden",
    web: "forbidden",
    why: "A concept explanation. Stable for decades.",
  },
  {
    ask: "Explain why a cantilever beam deflects more than a simply supported one",
    library: "allowed",
    schedule: "forbidden",
    web: "forbidden",
    why: "Engineering fundamentals — the settled-knowledge case outside medicine.",
  },
  {
    ask: "What is the difference between a tort and a crime?",
    library: "allowed",
    schedule: "forbidden",
    web: "forbidden",
    why: "Law fundamentals. Same shape, third discipline.",
  },
  {
    ask: "thanks, that helped",
    library: "forbidden",
    schedule: "forbidden",
    web: "forbidden",
    why: "Conversation. Nothing to retrieve.",
  },
  {
    ask: "can you rewrite that paragraph more concisely",
    library: "forbidden",
    schedule: "forbidden",
    web: "forbidden",
    why: "Work on text already in the conversation.",
  },
  {
    ask: "what can you do?",
    library: "forbidden",
    schedule: "forbidden",
    web: "forbidden",
    why: "Capability question — the sibling of 'who are you'.",
  },

  // ── the student's own material ─────────────────────────────────────────────
  {
    ask: "what does my lecture say about beta blockers",
    library: "required",
    schedule: "forbidden",
    web: "forbidden",
    why: "Explicitly their material.",
  },
  {
    ask: "summarise the case my professor assigned on promissory estoppel",
    library: "required",
    schedule: "forbidden",
    web: "forbidden",
    why: "Law student, same private-source shape.",
  },
  {
    ask: "what did the thermodynamics deck say about entropy",
    library: "required",
    schedule: "forbidden",
    web: "forbidden",
    why: "Engineering student, same private-source shape.",
  },
  {
    ask: "what are my sources for this note",
    library: "required",
    schedule: "forbidden",
    web: "forbidden",
    why: "🔴 'sources' currently matches the web keyword list. It is THEIR note.",
  },
  {
    ask: "who is my professor for pharmacology",
    library: "allowed",
    schedule: "required",
    web: "forbidden",
    why: "🔴 'who is' currently forces a web search for a fact only their course data holds.",
  },
  {
    ask: "explain the 2026 syllabus for this course",
    library: "allowed",
    schedule: "required",
    web: "forbidden",
    why: "🔴 A recent year currently buys a search. In a syllabus a year is a date.",
  },

  // ── schedule ───────────────────────────────────────────────────────────────
  {
    ask: "what's due this week",
    library: "allowed",
    schedule: "required",
    web: "forbidden",
    why: "Calendar read. 'this week' is not current events.",
  },
  {
    ask: "when is my constitutional law midterm",
    library: "allowed",
    schedule: "required",
    web: "forbidden",
    why: "Same, in another discipline.",
  },
  {
    ask: "do I have anything scheduled tomorrow",
    library: "allowed",
    schedule: "required",
    web: "forbidden",
    why: "🔴 'tomorrow' and 'schedule' are both on the web keyword list.",
  },

  // ── the live web ───────────────────────────────────────────────────────────
  {
    ask: "What are the latest ACC/AHA hypertension guidelines?",
    library: "allowed",
    schedule: "forbidden",
    web: "required",
    why: "Guidelines are versioned and revised; freshness is the whole question.",
  },
  {
    ask: "Has the Supreme Court ruled on that case yet?",
    library: "allowed",
    schedule: "forbidden",
    web: "required",
    why: "Law, and phrased with no keyword from any current-events list — 'yet' is the signal.",
  },
  {
    ask: "What is the current version of the Eurocode for steel design?",
    library: "allowed",
    schedule: "forbidden",
    web: "required",
    why: "Engineering standards are revised; the answer has a version number that moves.",
  },
  {
    ask: "read https://www.fda.gov/news-events/press-announcements and tell me what is new",
    library: "allowed",
    schedule: "forbidden",
    web: "required",
    why: "A named URL. Nothing but fetching it will do.",
  },
  {
    ask: "search the web for recent papers on spaced repetition",
    library: "allowed",
    schedule: "forbidden",
    web: "required",
    why: "The student asked for the web in as many words.",
  },

  // ── both halves ────────────────────────────────────────────────────────────
  {
    ask: "does my lecture on anticoagulants still match current practice?",
    library: "required",
    schedule: "forbidden",
    web: "required",
    why: "Their material against the outside world — the composite case, unprompted phrasing.",
  },
  {
    ask: "my professor's notes say the standard is 1.5 — is that still right?",
    library: "required",
    schedule: "forbidden",
    web: "required",
    why: "Composite, engineering, and phrased as a challenge to their own source.",
  },
];

/** The owner's hand-written requirements, which the suite treats as a gate. */
export const HARD_CASES = ROUTING_CASES.filter((testCase) => testCase.hard);
