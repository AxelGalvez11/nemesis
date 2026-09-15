// The web app's canvas SOURCE logic, imported — not copied — by the phone. See web.ts for the
// rule this file follows (pure modules only, or modules whose only impurity is `@/lib/supabase`,
// which the phone's tsconfig points at its own client — see that file's header for the proof this
// already works at runtime: `learner-memory.ts`'s `loadMemory` takes the identical path and is
// already shipping in `canvas-turn.ts`).
//
// 🔴 `canvas-store.ts` IS INCLUDED, DELIBERATELY, UNLIKE `web.ts`'S OWN RULE OF THUMB. That file
// imports the browser Supabase client too — but only ever as `@/lib/supabase`, the one alias the
// phone's tsconfig redirects to its own client (`api/supabase.ts`). Nothing in `canvas-store.ts`
// touches `window`, `localStorage` or any other browser global at module scope; the browser
// fallback (`components/workspace/learn/canvas-store.ts`'s own header: "the browser when
// [the table] does not [exist]") lives inside functions this file never calls. `mergeSourceIntoCanvas`
// is pure data-in, data-out.

export {
  buildExcerpts,
  buildExcerptsFromModel,
  excerptsFromSourceContext,
} from "../../../web/lib/learn/canvas-grounding.ts";

export { mergeSourceIntoCanvas } from "../../../web/lib/learn/canvas-store.ts";

export {
  CANVAS_FILING_FOLDER,
  coverageNote,
  loadCanonicalSource,
  storedCoverageNote,
  type CanonicalLoad,
} from "../../../web/lib/learn/canvas-sources.ts";
