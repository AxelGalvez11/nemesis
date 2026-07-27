// Exam item-writing craft, for the one place on the phone that writes a test: the
// chat's add_practice_test tool.
//
// Ported from apps/web/lib/workspace/item-writing.ts, whose own header explains
// why it is a leaf module — two lanes on the web produce tests and must not drift
// apart. The phone's chat is now a THIRD lane, so it carries the same rules rather
// than a paraphrase of them.
//
// Source: the NBME Item-Writing Guide ("Constructing Written Test Questions for
// the Health Sciences", Oct 2024) — its rules for one-best-answer items plus its
// catalogue of technical flaws. Those flaws are not stylistic preferences: the
// measured effect is that a flawed item lets a test-wise student score above their
// actual knowledge, and penalises a student who knows the material but reads
// carefully.
//
// ONLY THE SHORT FORM IS HERE. The web's full nine-rule version rides in a chat
// skill and in a generation prompt, both of which have room for it. On the phone
// the rules ride inside a TOOL DESCRIPTION, which is sent on every turn that
// offers tools — so this is the version that earns its tokens. If the phone ever
// gains the skills system, port the long form then, not before.
//
import { usableQuestions, type TestQuestion } from "./study-artifact-content.ts";

/** The craft rules, compressed to one line, addressed to a model. */
export const EXAM_ITEM_RULES_SHORT =
  "One-best-answer only; a short scenario stem answerable before the options are read; options homogeneous and of similar length with the correct one never the longest; distractors drawn from real student confusions; no 'all/none of the above', no negative stems, no absolutes; refer to options by text, never by letter.";

const FLAWED_OPTION = /\b(?:all|none) of the above\b/i;
const NEGATIVE_STEM = /\b(?:not|except|least likely|false)\b/i;

/**
 * A stricter gate for tests created by the AI tool.
 *
 * The shared artifact reader stays permissive so it can open older and manually
 * authored tests. New AI tests have a higher bar: enough plausible choices,
 * unique options, a rationale, no negative stem, and no duplicate question.
 */
export function qualityPracticeQuestions(raw: unknown): TestQuestion[] {
  const seen = new Set<string>();
  return usableQuestions(raw).filter((question) => {
    const questionKey = question.q.toLocaleLowerCase().replace(/\s+/g, " ");
    const optionKeys = question.options.map((option) => option.toLocaleLowerCase().replace(/\s+/g, " "));
    if (seen.has(questionKey)) return false;
    if (question.options.length < 3 || new Set(optionKeys).size !== optionKeys.length) return false;
    if (!question.why.trim() || NEGATIVE_STEM.test(question.q) || question.options.some((option) => FLAWED_OPTION.test(option))) {
      return false;
    }
    seen.add(questionKey);
    return true;
  });
}
