export interface ThinkingStep {
  label: string;
  /* "search" steps render as the ChatGPT Activity search block (search icon + gerund title + the
     searched-domain chips); "reason" steps render as the bullet + first-person paragraph block. */
  kind: "search" | "reason";
  current: string;
  detail: string;
}

export interface ThinkingPreview {
  title: string;
  subtitle: string;
  /* The persistent first-person plan line (ChatGPT-measured): streams in before the answer and stays
     visible above it permanently — it is NOT part of the collapsible trail. */
  intent: string;
  current: string;
  preview: string;
  steps: ThinkingStep[];
}

const MAX_FOCUS_CHARS = 64;

export const THINKING_STEPS: ThinkingStep[] = [
  {
    label: "Understand",
    kind: "reason",
    current: "Understanding what you are asking",
    detail: "I'm working out the topic, what you actually want to know, and whether there's any safety context to keep in mind before searching.",
  },
  {
    label: "Search",
    kind: "search",
    current: "Browsing trusted medical sources",
    detail: "Pulling official labels, papers, trials, and health context.",
  },
  {
    label: "Rank",
    kind: "reason",
    current: "Ranking the evidence",
    detail: "I'm comparing how strong, direct, and relevant each source is — preferring sources that actually support the claim over ones that only mention it.",
  },
  {
    label: "Answer",
    kind: "reason",
    current: "Writing the cited answer",
    detail: "I'm drafting the answer now, attaching citations only where the sources support the text.",
  },
];

export function summarizeQuestionFocus(question: string): string {
  const normalized = question.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_FOCUS_CHARS) return normalized || "your question";
  const clipped = normalized.slice(0, MAX_FOCUS_CHARS - 3);
  const boundary = clipped.lastIndexOf(" ");
  return `${(boundary > 24 ? clipped.slice(0, boundary) : clipped).trim()}...`;
}

/* The first-person plan line. Honest about what the engine really does (evidence check → practical
   answer); the question focus makes it feel bespoke without pretending the engine planned anything
   it didn't. Kept to ONE sentence — ChatGPT's reads as a single declarative plan. */
export function buildIntentLine(question: string): string {
  const focus = summarizeQuestionFocus(question);
  return `I'll check what the evidence says about "${focus}" across trusted medical sources, then turn it into a practical answer.`;
}

export function buildThinkingPreview(question: string, stage: number): ThinkingPreview {
  const index = Math.max(0, Math.min(stage, THINKING_STEPS.length - 1));
  const step = THINKING_STEPS[index] ?? THINKING_STEPS[0]!;
  const focus = summarizeQuestionFocus(question);
  const preview = [
    `You are asking about "${focus}", so I am first identifying the topic and likely meaning.`,
    `Searching FDA, NIH/NLM, PubMed, trials, and trusted medical explainers for sources that match "${focus}".`,
    "Comparing source strength, relevance, and whether each source supports, partially supports, or only mentions the claim.",
    "Drafting a concise answer and attaching citations only where the sources support the text.",
  ][index] ?? "Checking sources before writing the answer.";

  return {
    title: "Thinking",
    subtitle: "Evidence search · source ranking · cited answer",
    intent: buildIntentLine(question),
    current: step.current,
    preview,
    steps: THINKING_STEPS,
  };
}
