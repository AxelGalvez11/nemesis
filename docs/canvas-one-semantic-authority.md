# Three surfaces, one semantic authority

**Audit before code, requested by the owner 2026-08-20.** Nothing in this document has been
implemented. Read against `main` at `e6e2df4f`.

Two separate jobs are described here. They are independent and can ship in either order, but they
are both large, and the second one is the one that changes how the product thinks.

1. **Collapse to three surfaces.** Delete the Sessions product, finish retiring Study.
2. **One semantic authority.** No behaviour anywhere may be chosen by matching words in what the
   learner typed.

---

## Part 1 — The map

### Every route today, with a verdict

`/learn` is the Canvas. There is no `/canvas` route, and I recommend not creating one: `/learn`
is the authenticated landing path, the desktop app deep-links to it, and a rename breaks every
bookmark to buy nothing. **Keep the URL, call it Canvas everywhere else.**

| Route | What it is | Verdict |
|---|---|---|
| `/learn` | **The Canvas.** Composer, teaching document, replies, policy. | **Keep** — orchestration root |
| `/library` | Sources, files, notes. | **Keep** — surface 2 |
| `/calendar` | Scheduled work and deadlines. | **Keep** — surface 3 |
| `/library/source/[id]` | A source reader. Deep-link format is documented and in use. | **Keep** — part of Library |
| `/sessions` | **A second, complete chat product.** No retirement guard; fully live. | **Delete** |
| `/study` | Decks, cards, tests, mindmaps. Already behind `RetiredSurfaceGuard`. | **Delete** — see migration |
| `/notebooks` | **A third chat product** (NotebookLM-style: chat centre + right rail). | **Delete** — this is the one nobody has named |
| `/stats` | In your nav today as a fourth item. Source comment: *"Deliberately not built out."* | **Your call** — see open questions |
| `/graph` | Knowledge-graph workspace. Not in nav. | **Delete or fold into Library** |
| `/slides` | Slide viewer. Navigates back to `/library?note=`. | **Fold into Library** |
| `/plugins` | Plugin workspace. Not in nav. | **Delete** |
| `/library/classic` | The pre-docs Library, kept reachable out of nav. | **Delete** — the feature it protects now lives in `/library` |
| `/chill` | Already `redirect("/learn")`. Games code still present. | **Delete the code too** |
| `/settings`, `/account`, `/pricing`, `/legal/*`, `/sign-in` | Not product surfaces. | **Keep** |

**The finding you should care about most: there are three chat products, not two.** Sessions and
Notebooks each have their own composer, their own history, their own persistence and their own
routing. "No parallel teaching or chat experience outside Canvas" covers all three.

### The three chat implementations, side by side

| | Canvas | Sessions | Notebooks |
|---|---|---|---|
| Entry | `askCanvasChat` | `chat-api.ts` | `notebooks/chat.ts` |
| How intent is decided | **a model call** (`turn-router.ts`) | `classifyChatRequest` — 15 regexes | `classifyChatRequest` — same regexes |
| How web need is decided | `shouldSearchWeb` — **6 regexes** | `chat-web-need.ts` — **a model call** | inherited regexes |
| Persistence | `learning_canvases` | `chat_threads` / `chat_messages` | `notebook_chats` / `notebook_chat_messages` |

Read the web-need row twice. **The Canvas is on the worse mechanism.** A model-based decision
already exists — `chat-web-need.ts`, written 2026-08-04 after you said *"it should know when to
lookup the internet"* — and its own header explains why a word list is wrong: it is English-only,
so a student asking in Spanish never gets a search. The Canvas never adopted it and still asks six
regexes whether the sentence contains "latest".

---

## Part 2 — Where raw language controls behaviour

I swept the repository and classified every hit. Most of what a naive grep returns is legitimate
and is listed at the bottom so you can see it was considered rather than missed.

### Category 1 — semantic interpretation, must move behind the interpreter

**Seven places. This is the real list.**

| # | Where | What it does |
|---|---|---|
| 1 | `chat-web-search.ts:19` `shouldSearchWeb` | Six regexes decide whether to buy a web search. **`/latest\|current\|news\|price\|today/`** — your example, verbatim. Reached from the Canvas. |
| 2 | `chat-routing.ts:178` `classifyChatRequest` | ~15 patterns choosing model, route, effort and web. Includes `LEARNING_PATTERN` (`explain\|teach\|quiz\|flashcards`) and `CASUAL_PATTERN` (`^hi\|hello\|hey$`). |
| 3 | `workspace-intent.ts` | A hand-built noun table (`calendars?\|deadlines?\|decks?\|flash\s?cards?…`) crossed with a verb table. Its own header states the bias: *"LEAN TOWARD MATCHING."* |
| 4 | `canvas-phrases.ts:118` `routeComposerText` | A phrase list for "make this simpler". Reached from the Canvas at `learning-canvas.tsx:51`. |
| 5 | `chat-routing.ts:118` `ACCEPTANCE` / `NOT_AN_ACCEPTANCE` | `^(yes\|yeah\|yep\|sure\|ok)` decides whether the learner accepted an offer. |
| 6 | `session-chat.tsx:107` | `/syllab/i.test(text) \|\| (/\b(add\|put\|import\|load)\b/ && /calendar\|schedule/)` routes to syllabus import. |
| 7 | `chat-effort.ts:67` `toolsAllowed` | Not lexical itself — but it takes tool availability from a route that **was** chosen lexically, so the words in a sentence silently decide whether Nemesis can see your calendar. This is the 2026-08-05 incident, still wired. |

`canvas-phrases.ts` deserves a note, because it argues against this change in its own comments. It
says a phrase list is legitimate here since "make this simpler" is an instruction to the system
rather than subject matter, and generalises across fields. That argument is coherent and it is
still wrong under your rule: a learner writes *"I'm lost"*, *"can you dumb this down"*, *"still not
clicking"*, and none of them are on the list. The list is not a field-specific heuristic; it is a
finite list standing in for an infinite set.

### Category 2 — deterministic invariants, keep in software

These look like violations and must **not** be moved. Deleting them to satisfy the principle would
be the actual mistake.

- **Is a question currently awaiting an answer** (`composer-intent.ts`). State, not meaning. The
  invariant *"submitting through the composer while a question is on screen is an answer"* stays
  exactly where it is.
- **Which mechanism a `work` turn reaches** — `begin()` on a fresh canvas, `command()` on a running
  one (`learning-canvas.tsx`). The model picks the intent; the canvas picks the mechanism.
- **Was an offer outstanding** — the state half of violation #5. Split it: *"was an offer made"* is
  software; *"is this reply an acceptance"* is the interpreter.
- **Is a rewrite referent determinate** (`canvas-phrases.ts`'s refusal path). The *phrase* detection
  moves; the *"exactly one unread chunk or refuse"* rule stays.
- **Whether a rewrite is owed a scaffold instead** — arbitration against live policy state. Stays.
- Tool availability, permissions, billing, rate limits, whether a file exists, persistence,
  idempotency, validation, destructive-action guards, Calendar constraints.

### Category 3 — literal syntax and format parsing, keep

Considered and dismissed: `chem-notation.ts` and `procedure-sequence.ts` (notation validation),
`reply-visuals.ts` (`[smiles: …]` — a deliberate formal token), `figure-asset-url.ts` (URL schemes),
`canvas-store.ts:202` (matching a **Postgres error string**, not a user), `lib/notebooks/*` and
`lib/reader/*` (docx tags, PDF font names), `break/*` games (`event.key`), `vocabulary-lookup.ts`
and `canvas-vocabulary.ts` (`WORD_CHAR` tokenisation), `choice-set.ts:208` (comparing a generated
distractor against a generated prompt so a question does not give away its own answer — never sees
learner text), `billing-contract.ts` (Stripe key prefixes).

### Category 4 — real, but out of scope

`schedule-from-document.ts` (`KIND_WORDS`, `DAY_WORDS`) and `schedule-candidates.ts` (`"tomorrow"`,
`"next Thursday"`) do natural-language inference with regexes. I traced the callers: **they read
syllabus documents, not learner utterances.** That is extraction, not intent routing, and your rule
is about the composer. Flagging them as genuinely weak, and deliberately not expanding this job to
cover them.

---

## Part 3 — The proposed end state

### The interpreter

One call, one place, at the top of a Canvas turn. Everything downstream receives the typed result
and never the sentence.

```ts
type CanvasIntent = {
  /** Does the surface change, or is this only talk? */
  mode: "reply" | "work";

  /** What the learner wants, in terms of Canvas capabilities that actually exist. */
  goal:
    | "answer"      // tell me
    | "learn"       // teach me this
    | "practise"    // give me reps
    | "assess"      // find out if I know it
    | "revise"      // say that again, differently
    | "create"      // make me a thing
    | "organise"    // file, rename, tidy
    | "schedule";   // put it in time

  /** The subject, or null when there is none. Also the gate on offering to teach. */
  topic: string | null;

  /** What they are pointing at. The model resolves the pronoun; the app resolves the id. */
  referent:
    | { kind: "none" }
    | { kind: "live-question" }
    | { kind: "passage" }
    | { kind: "source"; hint: string };

  /** Does answering require information the model cannot hold? Never inferred from "latest". */
  needsExternalKnowledge: boolean;

  /** Only meaningful when the app says a question is live. Semantics on top of state. */
  answersLiveQuestion: boolean;

  /** What Nemesis says. Present even when it also acts — acting silently reads as a bug. */
  say: string;
};
```

Deliberately **not** in the schema: which component to open, which model to use, how much effort to
spend, whether tools are allowed, whether the learner is permitted to search. Those are the
capability layer's, exactly as you specified — the intent says *assess the learner*, never *open the
test panel*.

### The invariant, enforced by the compiler rather than by review

A lint rule or a grep guard pins a shape, and shape guards in this repo have needed repointing
roughly a dozen times in a single session. Better: **stop passing the string downstream.**

```ts
type RawUtterance = string & { readonly __brand: unique symbol };
```

The interpreter is the only function that accepts a `RawUtterance`. Everything else takes
`CanvasIntent`. A downstream regex then fails to **compile** rather than failing review. Persistence
still stores the raw text — it simply cannot branch on it.

### The one real design problem: when to call the model

Today `shouldSearchWeb` runs *before* the model call, because search results are built into the
prompt. If the interpreter decides `needsExternalKnowledge`, the data flow forces a choice.

I recommend **interpret-and-answer in one call, and a second call only when the intent says
external knowledge is needed** — so the extra latency lands only on turns that were already paying
for a metered search. `decisionOrReply` half-does this already.

This is the risk in the whole plan, and it has a precedent: adding one front-door model call in
#689 produced a **blank screen for 25–59 seconds**. I will measure the p50 against the current path
on the existing eight-case set, three runs, before any cutover.

### Measured 2026-08-20: the single JSON turn cannot carry structured content

This stopped being a prediction. Driven against the live model in a browser, repeatedly:

- **Asked to plot y = x²**, the model writes the introducing sentence — *"Here's y = x² from x = 0
  to 5."* — and leaves `visuals` empty. In one run it wrote `[figure 1]` correctly and still
  supplied no payload, which says it understood the marker and not the object.
- **Asked to integrate x²**, instructing it to delimit its LaTeX **broke the turn entirely**, both
  with `\(` and with `$$`. It answered with Unicode math glyphs separated by literal newlines —
  `∫ 𝑥 2 𝑑 𝑥`, and once `𝑓𝑟𝑎𝑐` where `\frac` belonged. A literal newline cannot exist inside a JSON
  string, so the decision failed to parse and the raw `{"say": …}` envelope was printed on screen.
- **Adding a worked example** of the `visuals` array to the prompt made **both** turns hang past
  180 seconds. Two runs, systematic rather than sampling. Reverted.

`say` is a string inside strict JSON, and every backslash and newline the model writes there has to
survive its own escaping. It does not. **Mathematics and structured figures cannot travel in the
same call as the routing decision** — which is the two-call design above, arriving from a second
direction: the router decides and names what it wants, and a focused second call produces the
validated payload, exactly as the teaching path already does.

Fixed on the way through, and worth keeping regardless: a broken envelope no longer reaches the
learner. `decisionOrReply`'s "the prose IS the answer" rule is right for a model that ignored the
envelope and simply answered, and exactly wrong for one that attempted it and mangled it.

**Not tool-calling.** Two reasons: `toolsAllowed` turns tools off for every reasoner turn, so a
search tool would be available only on the turns least likely to need it; and a tool schema outranks
the system prompt, which would relitigate the router prompt at the same time as this change.

---

## Part 4 — What gets deleted, merged, migrated

Measured, not estimated — every number below is `wc -l` with tests excluded.

| | Lines | Action |
|---|---|---|
| `components/workspace/sessions/` + `/sessions` | **4,395** | Delete |
| `components/workspace/study/` + `/study` | **5,203** | Delete UI; migrate artifacts to Library |
| `components/workspace/notebooks/` + `/notebooks` | **1,963** | Delete — third chat product |
| `lib/workspace/sessions-*`, `session-turns`, `study-*`, `lib/notebooks/chat.ts` | **4,074** | Delete with their surfaces |
| `chat-routing.ts`, `chat-effort.ts`, `workspace-intent.ts`, `chat-web-need.ts` | **613** | **Likely deletable outright** once Sessions and Notebooks are gone — their only callers are `chat-api.ts` and `notebooks/chat.ts` |
| `chat-web-search.ts:shouldSearchWeb` | 30 | Delete; the interpreter replaces it |
| `canvas-phrases.ts` | 148 | Phrase list deleted; the referent and arbitration rules move into the capability layer |
| `retired-surface-guard.tsx` | 48 | Delete once the deep-link callers below are re-pointed |

**About 16,400 lines**, of which ~11,600 is user interface.

### The trap in this deletion, and it would have been expensive

**`lib/notebooks/` is not the Notebooks surface. It is the document ingestion pipeline.** Fifty-two
files: `mistral-ocr`, `llamaparse-model`, `docling-client`, `docx-structure`, `csv-structure`,
`office-text`, `figure-assets`, `extract-coverage`. That is the parsing and cost work another
engineer is actively building, and it is what every uploaded document on the Canvas goes through.

Deleting `/notebooks` the surface must touch exactly four files in that directory — `chat.ts`,
`chats-api.ts`, `outputs-api.ts`, `deliverables.ts` — and nothing else. A directory-level delete
here would take out document ingestion for the entire product, and it would look reasonable in a
diff. Any implementation of this plan names those four files explicitly and never a directory.

## Part 5 — Persistence and schema

**Six tables.** `chat_threads`, `chat_messages`, `chat_recording_artifacts`, `notebook_chats`,
`notebook_chat_messages`, `notebook_outputs`, `notebook_sources`, `notebooks`, plus the study set:
`study_decks`, `study_cards`, `study_artifacts`, `study_review_logs`, `study_designs`,
`study_characteristics`.

**Two migrations are genuinely required. The rest is code.**

1. **Stored `/study` links.** `SessionOutput.url` and `SessionOutput.route` are written to the
   cloud and read back (`sessions-cloud.ts:111-118`), and `agent-tools.ts` mints
   `/study?section=cards|tests|mindmaps` into them. **These strings are in the database**, so
   deleting `/study` breaks saved cards retroactively. This needs a data migration, not a repoint —
   I checked specifically because a repoint would have been the easy wrong answer.

2. **Review history.** `study_review_logs` is real learner evidence with real spacing state. It must
   move to the Canvas learner model, not be dropped with the UI.

**Two external callers block the last step**, and neither is ours to fix on our own schedule:

- the **shipped browser extension** opens `app.enternemesis.com/library?import=coursework`.
  `/library` survives, so this is safe — but the `?import=` handler must survive with it.
- the **iOS artifact card** shares `SessionOutput.route`.

`chat_threads` / `chat_messages` hold real user history. I would **retain the tables and stop
writing to them** rather than drop them in the same change that removes the UI.

## Part 6 — Acceptance tests

A unit test with a stubbed interpreter proves nothing — it tests the switch statement below the
stub. These hit the live model, three runs, and they need negative cases or they pass on a regex.

**Converge** (same `goal`, no phrase privileged):

- "quiz me on this" · "see if I actually know this" · "hit me with some questions" · "I think I know
  it, check me" → `goal: "assess"`
- "make this simpler" · "I'm lost" · "can you dumb this down" · "still not clicking" → `goal:
  "revise"`
- "what's the latest on X" · "has the EU signed off on that rule yet" · *the same question in
  Spanish* → `needsExternalKnowledge: true`

**Must NOT converge — this is the calibration, and without it the suite passes on a keyword list:**

- "what's the difference between a quiz and an exam?" — contains "quiz", is **not** an assessment
  request
- "help me understand this" and "walk me through it" — must stay `work`, not collapse to `reply`.
  These two broke in #689 and again in #706 from an unqualified tie-break.
- "hello" — must not start a lesson. This is the #689 regression.

Every case runs three times. A 3-of-3 requirement on convergence, and a 0-of-3 on the negatives.

---

## Open questions for you

1. **`/stats`** is a fourth item in your nav today, and its source says it is deliberately not built
   out. Delete it, or keep it as a fourth surface?
2. **`/notebooks`** is a third chat product you did not name. I read your rule as covering it.
   Confirm before I delete ~4,000 lines.
3. **Study review history** — `study_review_logs` is real spacing data. Migrate into the Canvas
   learner model, or accept losing it?
