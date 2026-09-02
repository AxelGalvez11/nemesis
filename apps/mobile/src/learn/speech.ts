// The web app's read-aloud logic, imported — not copied. See web.ts for the rule (pure
// modules only): every file re-exported below declares itself "PURE" at the top and reaches
// nothing the phone cannot resolve — `reply-speech.ts` walks through `reply-visuals.ts` into
// the same visual/chem-notation chain `turn.ts` already re-exports as `replySegments`, so this
// file adds no new resolution risk, only new exports off an already-proven chain.
//
// 🔴 `reading-voice.ts` IS THE ONE FILE HERE WITH A LIVE `@/` IMPORT (`canvas-voices.ts`, a
// VALUE import, not a type). tsc resolves it fine through the phone's `@/*` path fallback to
// `../web/*`. Deno cannot: it has no import map, so nothing that needs a Deno unit test may
// import THIS file — `lib/speak-plan.ts` takes an already-built `ReplyUtterance[]` instead of
// reaching back into this module, precisely so its test never has to load `reading-voice.ts`.
//
// 🔴 NOT `canvas-speech.ts`'s OWN EXPORTS DIRECTLY: `reply-speech.ts` already re-exports what a
// reply needs from it (`sayableProse`), and `speechFor`/`shouldSpeakAction` are for the
// question/correction lane (`canvas-speech.ts`'s own header), which nothing here uses.

export {
  ttsRequest,
  type TtsRequestInput,
  type TtsRequestPlan,
} from "../../../web/lib/learn/tts-request.ts";

export {
  OPENER_BOUND,
  openerSplit,
  openerUtterance,
  replySpeechPlan,
  sayableProse,
  type ReplyUtterance,
} from "../../../web/lib/learn/reply-speech.ts";

export {
  DEFAULT_READING_VOICE,
  XAI_READING_VOICES,
  sameVoice,
  type ReadingProvider,
  type ReadingVoice,
} from "../../../web/lib/speech/reading-voice.ts";
