# Nemesis study pages — OSS research & build recommendations
*Generated: 2026-07-09 · Sources: ~45 (GitHub repos/LICENSE files, official docs, Electron/Apple primary docs) · Confidence: High on licenses (raw LICENSE files read), Medium on star counts (live snapshots, drift expected)*

Three parallel deep-research passes (notes/editors, lecture recording, flashcards+graph) for the four
new pages the owner wants added to the Nemesis desktop app (the desktop chassis, Electron + React + TS,
closed-source commercial subscription product).

## Executive summary
1. **No popular open-source notes app can be legally embedded** — SiYuan (45k★), Logseq (43.8k★),
   AppFlowy (73.6k★), Trilium (36.8k★), Joplin (55.5k★) are all AGPL (viral: embedding forces Nemesis
   open-source); Outline (39.6k★) is BSL (forbids competing paid products). **Study their UX, copy zero code.**
2. **The right notes build is our own page over the markdown vault we already have**, edited with
   **CodeMirror 6 (MIT)** — the same engine Obsidian itself uses, *and already bundled in the
   chassis*. Wiki-links/backlinks via `@flowershow/remark-wiki-link` (MIT, active, Obsidian-syntax) +
   a ~100-line vault indexer that also feeds the graph.
3. **Flashcards: keep `ts-fsrs` (MIT, 706★)** — FSRS is Anki's own default algorithm now, still SOTA on
   the field's 10k-collection benchmark. Copy Anki's muscle memory (deck browser, flip + Again/Hard/
   Good/Easy, heatmap), Mochi's markdown card editor. **Anki itself is AGPL — patterns only.**
4. **The Anki bridge is the growth lever**: med students stay for the AnKing shared-deck ecosystem, not
   the algorithm — so one-click `.apkg` export via **`ankipack` (MIT, current Anki 24.x schema, writes
   FSRS config natively)** neutralizes the switching cost. Quizlet: no API (2026) → "paste your export" importer.
5. **3D graph: keep `3d-force-graph` (MIT, 6.2k★)** — still the community default for exactly this
   (Obsidian's own 3D plugin uses it). Watch cosmos.gl (MIT, GPU, very active) if it ever ships 3D.
6. **Lecture recording is now technically easy on modern stacks**: Electron v39+ makes macOS system-audio
   capture native (CoreAudio process tap, macOS 14.4+ floor) — no virtual-driver hacks. Transcribe locally
   with **whisper.cpp (MIT, 51.5k★, `small` model = real-time on any Apple Silicon, ~3.4% WER)**.
   v1 speaker labels = "You / Lecture" channel split (same as Granola ships). Best full reference:
   **Meetily (MIT, 22.1k★)**; borrow only from MIT/BSD projects (Meetily, Vibe, AudioCap); Glass/
   cheating-daddy are GPL → inspiration only.
7. **Cluely proves the tech, we invert the posture**: Cluely is invisible-by-design (hidden from screen
   shares, marketed as "AI that cheats"); Nemesis uses the same capture APIs with a visible persistent
   recording indicator, user-initiated only — macOS's own permission prompt already forces disclosure
   to the user; we extend that transparency to the room.

## 1. Notes page ("Library")
| Candidate | Stars | License | Verdict |
|---|---|---|---|
| SiYuan | ~45k | AGPL-3.0 (LICENSE read) | **NO embed/fork** — court-tested copyleft applies to desktop bundling, not just SaaS. UX inspiration (block refs). |
| AFFiNE | 70.3k | Client MIT / server proprietary | Closest legal path, but the embeddable unit (BlockSuite) is web-components-not-React; licensing history messy. Pass. |
| Logseq / AppFlowy / Trilium / Joplin | 43.8k / 73.6k / 36.8k / 55.5k | all AGPL | Patterns only. (Trilium's live repo is `TriliumNext/Trilium`, 36.8k — not the archived `Notes` repo.) |
| Outline | 39.6k | BSL-1.1 | License explicitly forbids competing document products. No. |
| silverbullet / Foam / Dendron | 5.6k / 17.3k / 7.5k | MIT / MIT / Apache-2 | Legal but wrong shape (Deno server / VS Code extensions; Dendron abandoned). |

**Build (all MIT):** our own React route over the existing Obsidian-compatible vault.
- **Editor: CodeMirror 6** — markdown text *is* the buffer (zero round-trip loss); literally what
  Obsidian's Live Preview runs on; **already in the chassis** (used for its config editors).
  Fallback if we want faster WYSIWYG polish: Milkdown (MIT, 11.7k★, remark-native).
- **Wiki-links:** `@flowershow/remark-wiki-link` (MIT, v4 ~2 weeks old; `[[link|alias]]`,
  `[[link#heading]]`, `![[embeds]]`) + `unified`/`remark-parse`/`remark-frontmatter`.
- **Backlinks/graph index:** hand-rolled ~100-line pass (note = node, resolved wikilink = edge,
  invert for backlinks). `@foam/core` (MIT) does it all but is 0.x — watch, don't bet.

## 2. Flashcards page ("Study")
- **Scheduler: `ts-fsrs` stays** (MIT, active within 24h, FSRS-6; benchmark across ~10k real Anki
  collections: FSRS-6 ≫ SM-2/SM-17 era; FSRS-7 gap is small — watch ts-fsrs v6 API refactor branch).
- **Anki (29k★) is AGPL** → interaction patterns only: hierarchical deck browser with due-count badges,
  flip-card review with keyboard Again/Hard/Good/Easy, and a review heatmap (top community add-on
  pattern; cheap from FSRS logs). Mochi (closed) → markdown-first card editor pattern.
- **The moat insight:** students are loyal to the **AnKing deck ecosystem** (shared USMLE/pharm decks),
  not Anki's UI. Bridge, don't fight: **`.apkg` export via `ankipack`** (MIT, targets Anki 24.x+/V18
  schema, embeds FSRS params; young — read its source). genanki-js is AGPL + stale → no.
- **AnkiConnect** (moved to sr.ht): optional "push to your running Anki" — we're just a local HTTP
  client of the student's own add-on; re-verify its license at the new home before shipping docs.
- **Quizlet 2026:** no public API; export restricted to own sets → ship a paste/CSV importer.

## 3. 3D knowledge graph page
**Keep `vasturiano/3d-force-graph`** (MIT, 6.2k★, v1.80.0 Apr 2026) + `react-force-graph` (3.2k★) —
the Obsidian community's own answer for 3D vault graphs. Alternatives are 2D-first (sigma.js 12.1k,
G6 12.2k) or 2D-only (cosmos.gl — MIT, GPU-shader layout, extremely active; the one to re-check
periodically for a 3D mode). Graph data comes free from the notes-page vault indexer (§1).

## 4. Lecture recording ("Recorder") — the Cluely-class feature, consent-first
**Capture (macOS, primary):** Electron **v39+** made Chromium's CoreAudio **process-tap** the default
for `desktopCapturer` + `session.setDisplayMediaRequestHandler({ audio: 'loopback' })` →
`getDisplayMedia`. Floor: **macOS 14.4+**. The OS forces a visible "Screen & System Audio Recording"
permission — our consent posture builds *on top of* Apple's own gate. The chassis already
declares `NSAudioCaptureUsageDescription`/`NSMicrophoneUsageDescription` in its electron-builder
config (it ships voice features), so the entitlement plumbing exists. Skip BlackHole entirely
(GPL-3.0 driver, obsolete for a 14.4+ floor). Windows phase 2: WASAPI loopback (distinct task).
Finer control fallback: tiny Swift helper on the same tap API — reference `insidegui/AudioCap`
(BSD-2, 503★). Electron-version note: check the chassis's Electron at implementation time; if <39,
the feature waits on (or forces) the upstream bump.

**Transcription:** **whisper.cpp** (MIT, 51.5k★) `small` = real-time on all Apple Silicon (RTF
0.03–0.10, ~3.4% WER — near cloud parity; single-blog benchmark, treat as approximate) + post-hoc
"re-transcribe with large-v3" option. Evaluate **Parakeet** (CC-BY-4.0; Meetily's new default) on
real lecture audio. **Diarization:** v1 = channel labels ("You" = mic, "Lecture" = system) — exactly
what Granola ships; v1.5 = **sherpa-onnx** (Apache-2.0, 13.5k★, built-in diarization). pyannote:
MIT code but gated models — friction, pass.

**Reference repos:** study **Meetily** (MIT, 22.1k★ — closest full analog: mic+system capture,
whisper.cpp/Parakeet, local-first) and **Vibe** (MIT, 6.7k★, whisper.cpp integration); Hyprnote/
anarlog (8.8k★, now MIT after a GPL→MIT switch ~Apr 2026) for local-first architecture. **GPL =
inspiration only:** Glass (7.6k★ — note its Sequoia permission-detection bug, issue #38, a pitfall
to design around), cheating-daddy (5.4k★ — the what-not-to-do on trust). screenpipe (19.7k★):
license ambiguous (NOASSERTION) — verify before borrowing anything.

**Cluely (the market proof):** desktop app, system-audio+mic capture, **cloud** transcription, and
**invisible by design** (hidden from dock/screen-shares; "AI that cheats" marketing; $15M a16z).
Nemesis = same capture class, opposite posture: persistent visible indicator, user-initiated,
never hidden from shares. That inversion *is* the product position (see the Einstein-ban lesson in
the autopilot research doc).

## How the pages slot into the chassis (implementation frame)
The shaping plan (§B2) hides Capabilities + Messaging from `SIDEBAR_NAV`
(`apps/desktop/src/app/chat/sidebar/index.tsx:133-148`) and `APP_ROUTES`
(`src/app/routes.ts:43-54`). The four new pages are additions to those same registries:
**Library** (notes, §1) · **Study** (flashcards, §2) · **Graph** (§3) · **Recorder** (§4), each a
lazy-loaded React route like the existing `ArtifactsView`. The old hand-built `apps/desktop-agent`
prototype is the seed-code donor: its FSRS queue/grading (`study.js`), vault writer + tag-linker
(`notes.js`), and 3d-force-graph wiring (`graph.js`) port into these pages nearly 1:1.

**Suggested build order** (each independently shippable):
1. **Study** (flashcards) — smallest, highest wow, seed code exists; + `ankipack` export.
2. **Library** (notes) — CodeMirror 6 already in-chassis + vault indexer (unlocks backlinks).
3. **Graph** — one page over the §2 indexer + vendored 3d-force-graph.
4. **Recorder** — gated on chassis Electron ≥39 + macOS 14.4 floor decision; whisper.cpp `small`.

## Key sources
- github.com/siyuan-note/siyuan (LICENSE) · opensource.stackexchange.com/questions/6879 (AGPL-in-desktop-apps, FSF FAQ + German/Hancom cases)
- github.com/codemirror/dev · forum.obsidian.md/t/43047 (Obsidian Live Preview = CM6) · npm @flowershow/remark-wiki-link
- github.com/open-spaced-repetition/ts-fsrs · github.com/open-spaced-repetition/srs-benchmark · github.com/ankitects/anki (AGPL) · npmjs.com/package/ankipack · pmc.ncbi.nlm.nih.gov/articles/PMC10403443 (Anki in med ed)
- github.com/vasturiano/3d-force-graph · github.com/chthollyphile/obsidian-3d-graph-view-plugin · github.com/cosmosgl/graph
- electronjs.org/docs/latest/api/desktop-capturer (loopback + CoreAudio tap default in v39) · developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps · github.com/electron/electron/issues/45107 (Granola named) · github.com/insidegui/AudioCap
- github.com/ggml-org/whisper.cpp · github.com/k2-fsa/sherpa-onnx · github.com/Zackriya-Solutions/meetily · github.com/thewh1teagle/vibe · github.com/fastrepl/anarlog (Hyprnote) · github.com/pickle-com/glass (GPL) · docs.granola.ai (Me/Them labels) · docs.cluely.com/debugging/audio

## Methodology
Three parallel research agents (notes/editors · recording/transcription · flashcards/graph), each
using live web search + direct GitHub/LICENSE/doc scrapes, 2026-07-09. Licenses verified against raw
LICENSE files where marked; star counts are same-day snapshots. Cross-checked against prior findings
in docs/research/school-agent-oss-landscape-2026-07.md (ankipack pick re-confirmed independently).
