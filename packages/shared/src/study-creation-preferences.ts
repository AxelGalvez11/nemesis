// Study-creation request detection, shared by web and phone chat.
//
// This module USED to be a deterministic preflight that interrupted "make me
// flashcards / a test" with a configuration question. That question is retired
// (owner 2026-08-03, learning loop): everything defaults to Auto and a learner
// who wants specifics simply types them. What remains is the detection —
// which requests ARE study creation (studyCreationKind, still used to steer
// skills/routing) — and the history compatibility below, so replies to the
// old question in existing conversations keep working.

export type StudyCreationKind = "flashcards" | "test";

const CREATE =
  /\b(?:make|create|build|generate|draft|prepare|save|put together|whip up|give me|set up|turn\s+(?:this|that|these|it)\s+into)\b/i;
const DIRECT_REQUEST = /\b(?:i (?:need|want)|can you|could you|please)\b/i;
const FLASHCARDS = /\b(?:flash\s*cards?|anki cards?|study cards?|study deck)\b/i;
const TEST =
  /\b(?:practice\s+|mock\s+)?(?:tests?|quiz(?:zes)?|exams?|question banks?)\b/i;
const BARE_FLASHCARDS = /^(?:please\s+)?(?:\d+\s+)?(?:flash\s*cards?|anki cards?|study cards?)\b/i;
const BARE_TEST =
  /^(?:please\s+)?(?:an?\s+|another\s+|\d+\s+)?(?:practice\s+|mock\s+)?(?:tests?|quiz(?:zes)?|exams?|question banks?)\b/i;
const CODE_TEST =
  /\b(?:unit|integration|e2e|end-to-end|regression|snapshot)\s+tests?\b|\btests?\s+(?:for|of)\s+(?:this|that|the|my)\s+(?:function|method|class|component|module|code|file|endpoint)\b|\btest\s+(?:suite|case|file|harness)s?\b/i;
const INTERACTIVE_QUIZ =
  /\b(?:quiz|test|question)\s+me\b|\bi need you to test me\b|\btest my (?:knowledge|understanding)\b/i;
const ASKS_ABOUT =
  /^(?:what|why|how|when|where|who|which)\b/i;

const CANCEL = /^(?:never mind|nevermind|cancel|stop|don't|do not|no thanks?)\b/i;

const FLASHCARD_PROMPT_PREFIX = "Before I build the flashcards:";
const TEST_PROMPT_PREFIX = "Before I build the test:";

/** The study artifact the learner is explicitly asking chat to create. */
export function studyCreationKind(text: string): StudyCreationKind | null {
  const compact = text.trim();
  if (!compact || INTERACTIVE_QUIZ.test(compact) || ASKS_ABOUT.test(compact)) return null;
  const requested = CREATE.test(compact) || DIRECT_REQUEST.test(compact);
  if ((requested && FLASHCARDS.test(compact)) || BARE_FLASHCARDS.test(compact)) return "flashcards";
  if (!CODE_TEST.test(compact) && ((requested && TEST.test(compact)) || BARE_TEST.test(compact))) return "test";
  return null;
}

/** Which deterministic question an earlier turn asked, if any. */
export function studyCreationKindFromPreferencePrompt(text: string): StudyCreationKind | null {
  const compact = text.trim();
  if (compact.startsWith(FLASHCARD_PROMPT_PREFIX)) return "flashcards";
  if (compact.startsWith(TEST_PROMPT_PREFIX)) return "test";
  return null;
}

/** A short reply to our own preference question continues the original save. */
export function isStudyCreationPreferenceReply(text: string, priorAssistantText: string): boolean {
  return Boolean(
    text.trim() &&
      !CANCEL.test(text.trim()) &&
      studyCreationKindFromPreferencePrompt(priorAssistantText),
  );
}

/**
 * The clarification chat should show before creating a deck or test.
 *
 * 🔴 ALWAYS NULL NOW — the question is retired (owner 2026-08-03, learning
 * loop: Nemesis "should not ask the user to configure this unless they
 * explicitly want to"). Everything defaults to Auto: the model picks card
 * types from the content and sizes a test to the material, and any preference
 * the learner DID type ("20 hard questions", "cloze cards") still rides the
 * request text into the model turn exactly as before — stating a preference
 * is the explicit want. The function stays (both clients call it, and
 * studyCreationKindFromPreferencePrompt/isStudyCreationPreferenceReply must
 * keep recognising the question in OLD conversations so a reply to one still
 * continues that save instead of reading as a brand-new request).
 */
export function studyCreationPreferencePrompt(text: string): string | null {
  void text;
  return null;
}
