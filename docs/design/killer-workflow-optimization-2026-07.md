# Killer-workflow cost optimization — school ingestion, flashcards/notes, homework drafting
2026-07-15 · grounded in three parallel research passes (codebase audit + LMS-API/browser-automation scan + flashcard-pipeline research). Full agent findings summarized inline; source URLs at the end.

## Operating principles (the whole research, distilled)
Goal: lowest cost AND generous use for even heavy users — which is ONE goal, because making
each workflow 10–30× cheaper is exactly what lets the same budget stretch 10–30× further.
DeepSeek tokens are cheap; what's expensive is **the model thinking in a loop** and
**re-reading big blobs**. Every rule below is a way to stop one of those.

1. **Model = judgment only.** The paid model decides what's exam-worthy, writes the "why",
   does final review. It NEVER parses a file, clicks a page, formats a card, or filters mail.
2. **Deterministic layer does the bulk, at $0.** Code + the student's own Mac handle parsing,
   OCR, embeddings, dedup, chunking, card formatting, and *replaying* known browser workflows.
3. **Do it once, cache forever.** Hash every file → unchanged file re-ingests for free. Delta
   sync (only what changed). A stable digest kept as context prefix rides DeepSeek's cache (50–120× cheaper).
4. **Separate ingestion from generation.** Reading a 200-page textbook must NOT trigger a
   200-page model analysis. Ingest → compact digest → the model reads the digest, never the raw dump.
5. **Structured text, never pixels.** Accessibility tree / extracted text, not screenshots or
   vision-per-page. 10–30× on the read side alone.
6. **Take the model out of repeat work.** Record a browser workflow once, replay the script
   free forever. Skip the browser entirely when a real student API exists (Canvas/Moodle/session-ride).
7. **Cap the tail, don't starve the middle.** Hard per-workflow budgets (~25 steps / 100k in /
   15k out before asking) stop runaway loops; generous monthly allowances + prepaid boost packs
   let the heaviest users pay for their own overage instead of eating the margin.

## The core insight
All three workflows are the SAME expensive shape — an agent loop where every step re-sends
the whole conversation, so cost = steps × context. And all three have the SAME cheap fix,
which the codebase already half-implements:

> **Harvest structured data in one scripted shot → stage it to a small digest file →
> build everything from the digest. Never let raw page dumps / slide images / email bodies
> accumulate in the live conversation.**

The engine already has the cheap primitive: `browser_console` runs one JS snippet over a
persistent CDP connection and returns clean JSON (`tools/browser_tool.py:3852`). The skills
already tell the agent to prefer it — **but only for top-level list pages.** Inside each
course page, each assignment, and the standalone email flow, the agent still falls back to
the expensive click→snapshot→click loop. So ~70% of this plan is *propagating a pattern we
already own*, not inventing one — which makes it skills-only (live-syncable, no app build)
and low-risk.

Second insight, per-school: sometimes we can skip the browser entirely. A student's
already-logged-in session can often call the portal's OWN internal JSON endpoints (or a real
student API) and get structured data with zero page-parsing — 98–99% cheaper than scraping.

Hard product line (unchanged): **the agent fetches and DRAFTS; the student submits.** Never
auto-submit, never touch FAFSA/PII forms, hand CAPTCHAs to the student.

---

## Workflow 1 — School-website file ingestion
**Today:** Blackboard sweep = N courses × 2 tab-loads (Content, Announcements) each leaving
an accumulating accessibility-tree snapshot; the standalone Outlook flow still does a
click-Expand→click-submessage loop per email with NO body cap (the exact shape that cost a
measured ~6M tokens on 2026-07-14). Per full sweep today: roughly 1–3M tokens.

**Fixes (skills-only unless noted):**
1. **Bulk-pull inside each page, not just the list.** One `browser_console` eval per
   Content/Announcements/assignment page returning all items as `{title,type,dueDate,url}`
   JSON — instead of the accumulating snapshot. The principle is already written for the
   course-list page (`school-portal/SKILL.md:22-26`); extend it one level deeper.
2. **Wire the email cost-discipline block into school-portal's OWN Outlook flow.** Today only
   the orchestrator path (`nemesis-school-sync`) gets metadata-first / ≤10 bodies /
   extract-write-drop; a student invoking school-portal directly hits the unpatched recipe.
3. **Per-school API fast-path (Phase 2):** try a real student-accessible path before driving
   the browser — see the matrix below.
4. **Batch downloads** with one shell `mv`, not per-file (pattern already in `nemesis-organize`).
5. Keep the existing wins: delta seen-set (`school-sync.json`), 5-file cap, Apple Mail
   `osascript` bulk read.

**After:** a daily *delta* sync reads only what changed, via JSON not snapshots →
**~30–80k tokens/day (~1–2.5¢).** ~10–30× cheaper.

### Per-school ingestion matrix (what lets us skip the browser)
| LMS | Student-accessible API? | Practical path |
|---|---|---|
| **Canvas** | Yes — self-issued Personal Access Token, but ToS bars multi-user PAT use & some schools (e.g. UW–Madison, Nov 2025) disabled student tokens | Offer "paste a read-only token" as an optional fast-path; else session-ride the internal JSON; else browser |
| **Brightspace (D2L)** | No token flow, BUT a logged-in session can hit read endpoints directly and get JSON (`/d2l/api/lp/.../enrollments/myenrollments/`) | **Session-riding** — call internal JSON from the authed tab |
| **Moodle** | Yes on password sites (`/login/token.php`); SSO sites need a browser login relay | Token if it works; else one browser SSO login → API after |
| **Google Classroom** | Yes — student OAuth read scopes; admins can block, under-18 blocked by default | OAuth read-only where the school allows |
| **Blackboard (Anthology)** | **No** — every app is institution-admin-gated | **Forced browser** (bulk-console extraction is the win here) |
| **MS Graph (Teams/OneDrive)** | Technically student-consentable; EDU tenants usually lock it | Treat as forced-browser unless a tenant proves open |

**Takeaway:** Canvas/Moodle/Classroom *sometimes* give a near-free API; Brightspace leaks
JSON to a logged-in session; Blackboard/Teams force the browser — where the one-script bulk
harvest is exactly the lever. Log in ONCE (persist the session like Playwright `storageState`)
so re-syncs skip the login. **The session/token file is a live credential: never log it,
never commit it.**

---

## Workflow 2 — Flashcards + notes
**Today:** `nemesis-study-decks` teaches only `front⇥back` TSV, one card per line, no digest
step, and NEVER mentions cloze — even though the Study engine fully supports `{{c1::…}}`
with independent spaced-repetition scheduling per blank (`study/cloze.ts`, `model.ts`).
`nemesis-school-sync` Phase 3 says only "READ it and produce" three artifacts (note, deck,
vocab) per lecture, each re-deriving from source with nothing evicted between lectures.

**Fixes (skills-only):** adopt the **read-once → digest → batch-generate → QA** pipeline:
1. **Extract text once, never page-images.** 40 slides as text ≈ 3–5k tokens; the same deck
   as vision images ≈ 62–108k tokens *every read* (~$0.54/deck on a vision model — and
   DeepSeek has no image-input rate, so vision would force a second, pricier provider). No
   PDF-as-image path exists in the runtime today, so this is a **guardrail against
   regression**, stated explicitly: text-first (pdftotext / PPTX text runs), local OCR
   (Tesseract) only for scanned pages, vision never for text.
2. **Structured digest** (`.nemesis/scratch/<lecture>-digest.md`): objectives, key terms,
   numbers-with-source. Cheaper AND more accurate — feeding structure alongside the source
   measurably cut card hallucination 6.4%→4.8% in a 2026 med-ed study.
3. **Batch, schema-constrained generation:** ≤10 cards per structured call, batched by topic.
   The digest kept as a stable prefix rides DeepSeek's cache (repeated context 50–120× cheaper).
   Overnight sync can use async batch endpoints (50% off on Anthropic/OpenAI if the failover
   chain lands there).
4. **QA pass** (cheap/local model): does every number in a card trace back to the digest?
   Keep as a real gate, not just a generation-time instruction — automated QA over-flags but
   rarely misses (99% NPV in a 2026 npj Digital Medicine pipeline study).
5. **Teach cloze + card-quality rules that already work in plain TSV:** one concept per card,
   `{{c1::…}}` for enumerations (N atomic scheduled cards from one line = fewer output tokens
   for the same review value), dual Q/A+cloze for high-yield numbers, sharper source-fidelity
   with BAD/GOOD examples.
   - **Guardrail:** the Study page renders card text as PLAIN React text — HTML lists and
     MathJax would show as literal `<ol>`/`\frac{}` garbage. Keep equations as Unicode
     (`Cₛ`, `≤`). (Extra-field, tags, image-occlusion need a format change → Phase 3.)

**After:** a 5-lecture batch drops from ~1–2M tokens to **~150–400k**, ~5–10× cheaper, with
*higher* card quality (less hallucination, spaced cloze).

---

## Workflow 3 — Homework DRAFTING (never submit)
**Today:** no dedicated skill exists — it improvises from school-portal fetch + deliverables
draft, so it inherits Workflow-1's expensive fetch (click/snapshot per source) with none of
the mitigations.

**Fix (skills-only): a new `nemesis-homework` skill, a short fetch→digest→draft recipe:**
1. Bulk-pull the assignment prompt + rubric + attachment list in ONE `browser_console` call
   per assignment page (same lever as Workflow 1).
2. Stage materials' key points to `.nemesis/scratch/<assignment>-digest.md`; **reuse the
   Library + semester graph as a research cache** so Thursday's problem set reuses Monday's
   extraction instead of re-researching.
3. Draft from the digest into a reviewable artifact (or fill the portal's answer fields for
   review) and **STOP at submit** — restate the never-submit line, the CAPTCHA hand-off, and
   the no-PII-forms rule inside the skill so this surface carries them explicitly.

**After:** a multi-source assignment drops from ~0.5–1.5M tokens to **~100–300k**, ~5×,
with the trust line hard-coded where the work happens.

---

## Cross-cutting: cheap-vs-main-model split
| Task | Tier | Why |
|---|---|---|
| Extract text / OCR | Local tool, **$0** | Deterministic, no LLM |
| Reformat to Q/A or cloze, dedupe, validate TSV shape | Cheap/local model | Mechanical |
| Decide exam-worthy, extract atomic concepts | Main model | Judgment |
| QA: numbers trace to digest? | Cheap/local model | Pattern-match vs known-good |

On-device precedent already shipped: the recorder's speech model runs local in an Electron
`utilityProcess` at $0. Same shape (small GGUF via llama.cpp/Ollama, or Apple's on-device
FoundationModels — free, structured output, but a 4,096-token/session cap) could run the
mechanical card/QA tier for $0. **Phase 3 (needs app/engine work).**

---

## Phased build order
**Phase 1 — skills-only (biggest win, live-syncable, no app build):**
- Extend bulk-`browser_console` extraction into course/assignment/email detail pages.
- Wire email cost-discipline into `school-portal`'s Outlook flow.
- Add digest-staging to `nemesis-school-sync` Phase 3 + `nemesis-study-decks`.
- Upgrade `nemesis-study-decks`: cloze, card-quality rules, read-once→digest→batch→QA,
  Unicode-only guardrail.
- Create `nemesis-homework` (fetch→digest→draft, never submit).
- Add a per-job step budget + a "text-first, never page-images" guardrail.

**Phase 2 — per-school API fast-path (mostly skill logic + some token storage):**
- "Try student API / session-ride internal JSON before driving the browser" decision tree in
  `school-portal`, per the matrix. Canvas optional-token, Brightspace session-riding, Moodle
  token, Classroom OAuth-read. Persist the authed session so re-syncs skip login.

**Phase 3 — engine/app (release build):**
- On-device small model in a `utilityProcess` for the $0 mechanical/QA tier.
- Per-sync cost telemetry (report tokens/job to us) so we see the before/after for real.
- Study-page format upgrades (extra field, tags, image occlusion) if we want them.

## Estimated combined effect on the 2-hour/day student
| Workflow | Before | After |
|---|---|---|
| Daily school sync | ~1–3M | ~30–80k |
| 5-lecture flashcards/notes | ~1–2M | ~150–400k |
| Homework draft (multi-source) | ~0.5–1.5M | ~100–300k |

Turns the heaviest days from dollars into low tens of cents; the median student lands under
a penny a day. Phase 1 alone captures most of it.

## Borrow (all MIT unless noted)
- **canvas-mcp** — the `execute_typescript` bulk-op pattern (99.7% token savings) is the most
  directly reusable idea; port the technique, not necessarily the library.
- **chrome-devtools-axi** — benchmarked "batch actions into one script + compact-encode results".
- **TOON format** — 30–60% fewer tokens than JSON for uniform arrays (e.g. "all 40 assignments").
- **Stagehand `extract()`** — schema→typed JSON for unfamiliar portals (the 20% we haven't mapped).
- **Playwright `storageState`** — log in once, reuse the session (Apache-2.0).
- **blackboard-lms-browser-automation** — SSO/Duo/MFA + cookie-persist scaffold for the forced-browser case.

---

## Recommended license-cleared build stack (live-verified GitHub repos, 2026-07-15)
Every pick below was checked live for stars, maintenance recency, and license. Runtime: the
app is **Electron/Node + a Python agent backend**; "Node" = embeddable in the desktop app,
"Python" = the agent backend. **License rule for a paid closed product: MIT/Apache-2.0/BSD =
safe to bundle. AGPL/GPL = do NOT bundle** (can force our code open); study the pattern and
reimplement, or call as an arm's-length hosted API only.

### Browser automation — the biggest surprise: most of it is ALREADY installed
`apps/desktop-agent` already pins **Playwright ^1.45** (Apache-2.0). Three levers need ZERO
new dependency, just turning on built-in features:
- **Record-once → replay with no AI:** Playwright `codegen` records a manual session into a
  deterministic script. This is cost-lever #1 (the AI maps a workflow once; the script
  replays it free forever). Add a small "replay vs. re-record when the page changed" harness.
- **Structured text, not screenshots:** Playwright `accessibility.snapshot()` /
  `ariaSnapshot()` (confirm resolved version ≥1.49). Reference impl: **playwright-mcp**
  (Apache-2.0) — "no vision models, operates purely on structured data."
- **Log in once, reuse forever:** Playwright `storageState` — save the authed session, skip
  login + CAPTCHA on every re-sync. Treat the state file as a live credential (never log/commit).

Add on top (all permissive):
- **Stagehand** (MIT, Node) — self-healing cached replay ("runs without LLM inference,
  knows when to involve AI when the site changes") + one-shot Zod-schema `extract()`. Covers
  levers #1 and #4 in one adoption, same Playwright ecosystem.
- **OpenAdapt / openadapt-flow** (MIT, Python) — literal "record one demo → deterministic
  self-healing local replay, healthy runs make no model calls." Pilot on 1–2 workflows (fast-
  moving org). Its scan→approve→execute loop mirrors our never-auto-submit posture.
- **Readability** (Apache-2.0, Node) + **Turndown** (MIT, Node) — prose pages (syllabi,
  articles) → clean markdown with zero LLM cleanup. `trafilatura` (Apache-2.0) is the Python equivalent.
- **canvasapi** (MIT, Python, UCF) — for Canvas students, hit the real API with their own
  token; skip scraping entirely.
- **AVOID:** Skyvern (AGPL **and** vision-LLM-first = expensive, despite 22k★); Firecrawl
  self-hosting (AGPL — fine only as the existing hosted proxy call); Moodle-DL as a bundled
  lib (GPL). Noted-not-adopted: a "get a 4.0 without learning" repo — opposite of our trust line.

### Document ingestion — parse locally with code, never vision-per-page
- **PDF:** **pypdfium2** (Apache-2.0/BSD, Python — Chrome's PDF engine, C-speed) for bulk text;
  **pdfplumber** (MIT) selectively for tables; **unpdf** (MIT, Node) for quick in-app previews.
- **PPTX:** **python-pptx** (MIT, Python) — stale but OOXML is stable; still the complete option.
- **DOCX:** **python-docx** (MIT) for structure; **mammoth** (BSD, Node+Python) for a fast
  docx→HTML/markdown pass.
- **OCR (scanned pages only):** **RapidOCR** (Apache-2.0, ONNX, no PyTorch, accurate) primary;
  **tesseract.js** (Apache-2.0, Node/WASM) as the zero-Python fallback.
- **Optional heavy converter:** **Docling** (MIT, IBM) or **MarkItDown** (MIT, Microsoft) when
  a hard PDF needs pharmacy-grade table fidelity — off the default hot path (downloads models).
- **AVOID:** **PyMuPDF / pymupdf4llm** (AGPL-3.0 **and** a paid gate capping Office files at 3
  pages) and **Marker** (GPL-3.0 code + model weights free only under $2M revenue). Both are
  popular and both are launch-blockers for a paid product; the permissive picks above replace them.

### Email — parse + rules-first triage, LLM sees only course-relevant mail
- **Parse:** Python stdlib `email`/`mailbox` ($0) or **mailparser** (MIT, Node); **imapflow**
  (MIT, Node) for the IMAP connection (mscdex/node-imap is unmaintained — avoid).
- **Rules-first filter (before any LLM call):** **json-rules-engine** (ISC, Node) or
  **rule-engine** (BSD, Python) — sender domain / subject / attachment rules.
- **Dedup:** SHA-256 (stdlib, $0) by default; **datasketch** (MIT) only if near-dup detection
  is later needed.

### Notes / RAG / flashcards — do the grunt work on-device, LLM for judgment only
- **Chunk:** **chonkie** (MIT, Python) / **remark** (MIT, Node) for markdown notes.
- **Embed (no API, on-device):** **model2vec** (MIT, ~30MB, laptop-CPU milliseconds) or
  **fastembed** (Apache-2.0) for a bigger model menu.
- **Dedup:** **semhash** (MIT) — built to sit on model2vec embeddings.
- **Vector store:** **sqlite-vec** (Apache-2.0) — vectors in the SAME SQLite file as the decks,
  one datastore; **lancedb** (Apache-2.0) is the scale-up path.
- **On-device "mechanical tier" ($0):** **node-llama-cpp** (MIT) in an Electron `utilityProcess`
  — the exact shape of the recorder's speech engine, with built-in JSON-schema + tool calling;
  pair with a small **Qwen2.5/3** or **SmolLM3** (Apache-2.0) model for reformat/dedupe/QA.
- **Cards:** TSV already works today; **genanki** (MIT, Python) / **yanki** (MIT, Node) only when
  richer `.apkg` (media, custom note types) is wanted. **ts-fsrs** (MIT) — align our existing
  FSRS constants against it, not a new adoption.
- **PKM patterns to STUDY (not vendor — AGPL):** Logseq, Siyuan, Trilium for backlink/graph
  models; reimplement cleanly (as yanki-connect did for the GPL AnkiConnect protocol).

### The record-replay harness ties it together (cost-lever #1)
The single highest-leverage build: a per-workflow store where the FIRST run of "sync Blackboard"
or "pull this week's assignments" is AI-mapped and saved as a Playwright script + selectors +
`storageState`; every LATER run replays the script with **zero LLM calls**, and only falls back
to the AI to re-map when the script breaks (page changed). This is what turns a recurring daily
sync from "an agent thinking every step" into "a cached script running for free," and it's the
difference between the user's cost model and a several-times-higher free-form-agent bill.

### Does this hit the $3-Pro / $12-Max targets?
Yes, with headroom — **because we're already a local-first desktop app.** The stack pushes
every mechanical job (browser runtime, parsing, OCR, embeddings, dedup, card formatting) onto
the student's own Mac at $0 to us, leaving only DeepSeek judgment calls + light infra on our
side. That erases the "$0.50–0.60/mo cloud browser runtime" line a cloud competitor pays
(Browserbase $99/500hr) — our browser runs on the student's device. The targets are protected
NOT by the repos but by the two governors the user named: hard per-workflow budgets (~25
browser steps / 100k input / 15k output before asking) and record-replay taking the LLM out of
repeat runs. The real risk to the target is a free-form agent consulting DeepSeek every click —
which the record-replay harness + step budgets exist to prevent.
**Honest tradeoff:** local-first trades our server cost for the student's laptop resources —
a heavier install (model downloads: OCR ~10–30MB, embeddings ~30MB, optional small LLM ~2GB)
and more variance across student hardware. Worth it for the margins, but name it in the installer.

## Sources
Canvas API/tokens (documentation.instructure.com; it.wisc.edu token change) · Blackboard REST
framework (docs.anthology.com) · Brightspace session-riding (community.d2l.com) · Moodle web
services + SSO launch (docs.moodle.org) · Google Classroom scopes (developers.google.com) ·
MS Graph education (learn.microsoft.com) · Anthropic "Code execution with MCP" (98.7%) ·
canvas-mcp, chrome-devtools-axi, TOON, Stagehand, browser-use (GitHub) · a11y-tree vs
screenshots (searchenginejournal.com; Set-of-Mark arXiv:2310.11441) · Claude/Gemini vision
token tables · DeepSeek pricing (cache 50–120×) · Claude batch 50% · med-ed hallucination
study (medRxiv) · npj Digital Medicine 2026 QA pipeline · SuperMemo 20 rules · Anki cloze
manual · Apple FoundationModels.
