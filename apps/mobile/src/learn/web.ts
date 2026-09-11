// The web app's canvas logic, imported — not copied — by the phone.
//
// 🔴 ONE COPY OF THE CONVERSATION FORMAT. A canvas is `learning_canvases.document`, and its
// conversation is the `moments` array inside it, written by the web app's `appendMoment` and read
// back by its `reconstructMoment`. If the phone carried its own version of either, the two apps
// would drift the first time one of them changed a cap or a field — and a moment written by one
// app would silently render wrong on the other. So the phone reaches across the monorepo and
// uses the web's own modules.
//
// 🔴 ONLY PURE MODULES CROSS. Everything re-exported here declares itself "PURE. No React, no
// I/O." at the top of its own file and imports nothing but relative siblings; `canvas-store.ts`
// (which imports the browser's Supabase client) is deliberately NOT here — the phone has its own
// store in `api/canvases.ts` that mirrors it row for row. Before adding an export, check the
// source file imports no `@/…` path: the phone's `@/` means `apps/mobile/src`, and the alias would
// resolve to the wrong app without a compile error until Metro fails to bundle.
//
// 🔴 EXTENSIONS ON THE PATHS. Deno runs the phone's unit tests and needs them; tsc allows them
// (`allowImportingTsExtensions`); Metro ignores them. The web files' own imports are
// extensionless, which is why the tests run with `--unstable-sloppy-imports`.

export {
  appendMoment,
  lastThingSaid,
  makeMoment,
  MAX_ASSISTANT_TEXT,
  MAX_MOMENTS,
  MAX_USER_TEXT,
  sameMoment,
  type CanvasMoment,
  type CanvasMomentKind,
  type NewCanvasMoment,
} from "../../../web/lib/learn/canvas-moment.ts";

export {
  buildCanvasHistory,
  DRAWER_TITLE_LIMIT,
  reconstructMoment,
  shortTitle,
  TITLE_LIMIT,
  type CanvasHistoryEntry,
  type CanvasHistorySource,
  type HistoricalMoment,
} from "../../../web/lib/learn/canvas-history.ts";

export {
  fileTurn,
  turnHasContent,
  type CanvasThreadTurn,
  type ThreadSource,
} from "../../../web/lib/learn/canvas-thread.ts";

export {
  CANVAS_LEVELS,
  CANVAS_STATES,
  emptyCanvas,
  type CanvasLevel,
  type CanvasOutput,
  type CanvasSource,
  type CanvasState,
  type LearningCanvas,
  type SourceExcerpt,
} from "../../../web/lib/learn/canvas-model.ts";

export {
  CAPABILITY_COPY,
  COMPOSER_CAPABILITIES,
  isMakerCapability,
  MAKER_CAPABILITIES,
  type CapabilityCopy,
  type ComposerCapability,
} from "../../../web/lib/learn/composer-capability.ts";

export { documentTitle, TITLE_MAX } from "../../../web/lib/learn/document-title.ts";

// 🔴 A GROUNDED REPLY'S `[s1:e4]` MARKERS, THE SAME REGEX-BASED TRANSFORM THE WEB'S
// `AssistantMarkdown` RUNS BEFORE HANDING TEXT TO react-markdown (`components/workspace/learn/
// canvas-thread-turn.tsx` passes `files={files}` for exactly this). Pure string-in, string-out —
// no DOM, no React — so it crosses unmodified rather than being re-derived on the phone, which is
// how a marker came to resolve identically on both apps: same regex, same source list, same
// "unresolvable marker is deleted, never printed raw" rule.
export {
  citationsToMarkdown,
  fileRefsToMarkdown,
  groupCitationRuns,
  groupFileRuns,
  type FileCitation,
} from "../../../web/lib/workspace/chat-citations.ts";

// 🔴 `hostnameOf`/`sourceLabel` ONLY — NOT `faviconUrl`. That function returns the WEB's own
// same-origin path (`/api/favicon?domain=…`), right for a browser on `app.enternemesis.com` and
// meaningless as an absolute image URL on the phone. `citation-pills.ts` rebuilds the identical
// route against `APP_API_BASE` instead of pointing the phone at Google's favicon service directly
// — see that file's header for why: `apps/web/app/api/favicon/route.ts` exists specifically so a
// learner's reading list is never handed to a third party as a side effect of drawing a citation.
export { hostnameOf, sourceLabel } from "../../../web/lib/favicon.ts";

// 🔴 NOT `canvas-hosting.ts` (`isEvidenceStage`): its type imports reach `knowledge-types.ts`, which
// imports `@/lib/sources/source-context` — a web path the phone cannot resolve. The two retired
// evidence stages are spelled out in lib/canvases.ts instead, pinned to the web's list by a test
// that reads the web's source.
