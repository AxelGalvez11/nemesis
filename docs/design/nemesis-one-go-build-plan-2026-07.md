# Nemesis — the "one go" build run (2026-07-09)

*Owner: "do all of these in one go with verifications until all done." This is the execution plan of
record for that run. Companion doc: [study-pages research](../research/nemesis-study-pages-oss-2026-07.md)
(stack choices). All work landed as sequential commits on the `nemesis/study-v1` branch of the local
chassis checkout (since retired 2026-07-14), with patches archived in `apps/nemesis-desktop/patches/`
after each stage.*

## Scope (what "all of these" means)
1. **Student cuts** — hide Capabilities + Messaging pages, trim Settings to a student allow-list,
   hide coding surfaces (terminal, git/projects toggle, coding status row), soften remaining
   code-flavored welcome copy.
2. **Nemesis theme** — mono + red tint, set as default.
3. **Library** — notes page: real Markdown files (Obsidian-compatible), CodeMirror 6 editor,
   `[[wikilink]]` support + backlinks, seeded pharm notes.
4. **Graph** — 3D knowledge graph (3d-force-graph, MIT) over the Library's wikilink index.
5. **Recorder** — consent-first lecture capture v1: mic + system audio (Electron 40 loopback),
   save to disk, visible recording indicator; transcription = whisper WASM (tiny) post-hoc v1,
   native whisper.cpp as the documented upgrade.

## Decisions made solo to keep it one go (owner can override after)
- **Brand red = deep crimson `#b3382e` family** (visibly distinct from the app's danger red
  `#cf2d56`); swatch alternates offered after the run, one-hex swap.
- **Settings allow-list**: keep Appearance · Chat · Notifications · Archived chats · About(+Uninstall)
  · Safety (transparency builds trust). Hide Model · Providers · API keys · Gateway · Workspace ·
  Voice (returns with Recorder polish) · Memory · Advanced.
- **Routes for hidden pages stay** (harmless, nothing links to them); machinery under Capabilities
  stays alive for future evidence skills.
- **Recorder transcription v1 = post-hoc, small model, honest limits** — the plan's Gate B; if the
  WASM path proves flaky in-run, Recorder ships as record+save and transcription is explicitly
  deferred (reported, not hidden).
- **App icon files stay pending** (they need a real raster design pass); the in-app wordmark/greeting
  brand is already done.

## Stages & verification gates
Every stage: edit → `tsc -b` clean → renderer `vite build` clean → commit → patch export.
Functional verification happens at two rebuild checkpoints (packaged rebuilds are ~6-8 min each,
so we don't rebuild 5 times):

- **Stage 0 — Preflight.** Disk ≥2GB free; discover the backend fs API surface (the Library needs
  real file read/write); confirm/add deps: `@codemirror/lang-markdown`, `3d-force-graph`. Gate:
  all present or installable.
- **Stage 1 — Student cuts.** SIDEBAR_NAV −2 items; ⌘K palette −3 entries; settings allow-list
  filter in `settings/index.tsx`; coding-row unmounted; terminal statusbar hidden; projects toggle
  hidden; intro-copy "none"-personality bodies re-voiced for school. Gate: tsc+build.
- **Stage 2 — Theme.** `nemesisTheme` in `presets.ts` (mono neutrals + crimson primary/ring/
  midground/accent), registered, `DEFAULT_SKIN_NAME = 'nemesis'`. Gate: tsc+build.
- **✅ Checkpoint A — packaged rebuild #1.** CDP checks: sidebar shows exactly New session/Artifacts/
  Study(/Library/Graph placeholders pending); settings shows only allow-listed sections;
  `--theme-primary` computes to the crimson; screenshots captured.
- **Stage 3 — Library.** `library` route/nav/page: vault at `~/Documents/Nemesis Library` via the
  backend fs API; note list + CodeMirror 6 markdown editor; `[[wikilink]]` regex index → backlinks
  panel; 6 seeded pharm notes with cross-links on first run. Gate: tsc+build + parser smoke test.
- **Stage 4 — Graph.** `graph` route/nav/page: 3d-force-graph over the same index (node=note,
  edge=wikilink, click→open in Library). Gate: tsc+build.
- **Stage 5 — Recorder.** Main-process `setDisplayMediaRequestHandler` (system-audio loopback) +
  renderer page: big REC state, mic+system capture via MediaRecorder → save under
  `~/Documents/Nemesis Recordings` (fs API); Gate A: a real capture saves a non-empty file (the
  macOS Screen/System-audio permission prompt needs ONE owner click — flagged when it happens).
  Gate B: WASM whisper post-hoc transcription of a short clip; if flaky → defer, report.
- **✅ Checkpoint B — packaged rebuild #2 (final).** Full CDP walkthrough with screenshots of every
  page (welcome, Study review, Library note+backlinks, Graph, Recorder, trimmed Settings, theme) →
  sent to owner. Patches 0003+ exported; plan doc §status + memory updated; repo branch committed.

## Honest risk notes
- **Recorder is the only stage with real unknowns** (permission prompt UX, WASM model download
  ~40-150MB on a tight disk, transcription speed). It is deliberately LAST so everything else is
  already landed and verified if it fights back.
- **Graph on WebGL** in the packaged app should be fine (real GPU; proven earlier on this Mac in a
  visible window), but if the packaged sandbox surprises us, the graph gets a 2D canvas fallback
  and the 3D issue is reported.
- Packaged-rebuild wall-clock (~15 min total across two checkpoints) is the main fixed cost.

## Status (run executed 2026-07-09 evening)
- [x] Stage 0 — disk 4.3GB ✓; fs IPC discovered (preload readDir/readFileText/writeTextFile,
  hardened, home-scoped) → Library needs no backend; deps installable.
- [x] Stage 1 — student cuts (16 edits, all behind `src/nemesis.ts` NEMESIS_STUDENT_BUILD).
- [x] Stage 2 — `nemesis` theme (mono + crimson #b3382e), default skin.
- [x] Checkpoint A — rebuilt; in-app checks: nav = Artifacts+Study only ✓, settings =
  Chat/Appearance/Safety/Notifications/About opening on Appearance ✓, crimson active ✓.
- [x] Stage 3 — Library (vault IPC + CodeMirror + wikilinks/backlinks + seeds); parser smoke PASS;
  boot mkdir for both data folders in electron main.
- [x] Stage 4 — Graph (3d-force-graph ^1.80, theme-aware, ?note= deep link into Library).
- [x] Stage 5 — Recorder v1 (loopback handler + display-capture permission + writeBinary IPC +
  consent-first page). **Gate B (transcription) deferred as planned** — record/save/playback
  shipped; whisper transcription is the documented next step.
- [x] Checkpoint B — final rebuild + full in-app walkthrough (screenshots delivered to owner).
- Patches 0003–0008 archived in `apps/nemesis-desktop/patches/`.
- Known follow-ups: transcription engine; live system-audio capture needs the owner's one-time
  macOS Screen & System Audio Recording approval (first Start click); app icon raster pass;
  in-editor wikilink click-through.
