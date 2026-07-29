// Deterministic preflight for study artifacts created from chat.
//
// A model should not silently choose the shape of a deck or test for the
// learner. More importantly, this cannot be prompt-only: the exact failure this
// protects against is a model skipping the question and immediately calling a
// tool. Both clients call this helper before spending a model turn, then persist
// the returned question as an ordinary assistant message.

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

const FLASHCARD_FORMAT =
  /\b(?:cloze(?:\s+deletions?)?|basic(?:\s+(?:front[\/-]back|cards?))?|front\s*(?:\/|and)\s*back|reversed|reverse cards?|basic\s*(?:\+|and)\s*reversed|mixed?|a mix)\b/i;
const TEST_COUNT =
  /\b(?:\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|twenty-five|thirty|forty|fifty)\s*(?:-| )?\s*(?:questions?|items?|mcqs?)\b/i;
const TEST_DIFFICULTY =
  /\b(?:easy|beginner|introductory|medium|moderate|intermediate|hard|difficult|advanced|challenging|mixed difficulty|mix of difficult(?:y|ies)|vary(?:ing)? difficulty)\b/i;
const TEST_TYPES =
  /\b(?:multiple[- ]choice|mcqs?|true\s*(?:\/|or)\s*false|true[- ]false|short[- ]answer|fill[- ]in[- ]the[- ]blank|matching|essay|case[- ]based|question type|mixed questions?|mix of questions?|a mix)\b/i;
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

function joinedMissing(parts: string[]): string {
  if (parts.length === 1) return parts[0] as string;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/**
 * The clarification chat should show before creating a deck or test.
 *
 * Null means the learner already supplied every required choice, or this is not
 * a creation request. All missing test choices are asked together so chat does
 * not turn one simple request into three rounds of form-filling.
 */
export function studyCreationPreferencePrompt(text: string): string | null {
  const kind = studyCreationKind(text);
  if (kind === "flashcards") {
    if (FLASHCARD_FORMAT.test(text)) return null;
    return `${FLASHCARD_PROMPT_PREFIX} do you want cloze, basic front/back, basic + reversed, or a mix?`;
  }
  if (kind !== "test") return null;

  const missing: string[] = [];
  if (!TEST_COUNT.test(text)) missing.push("how many questions");
  if (!TEST_DIFFICULTY.test(text)) missing.push("the difficulty (easy, medium, hard, or mixed)");
  if (!TEST_TYPES.test(text)) missing.push("the question types (multiple choice, true/false, or a mix)");
  if (missing.length === 0) return null;
  return `${TEST_PROMPT_PREFIX} what do you want for ${joinedMissing(missing)}?`;
}
