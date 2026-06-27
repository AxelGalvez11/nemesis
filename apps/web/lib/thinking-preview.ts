export interface ThinkingStep {
  label: string;
  current: string;
  detail: string;
}

export interface ThinkingPreview {
  title: string;
  subtitle: string;
  current: string;
  preview: string;
  steps: ThinkingStep[];
}

const MAX_FOCUS_CHARS = 64;

export const THINKING_STEPS: ThinkingStep[] = [
  {
    label: "Understand",
    current: "Understanding what you are asking",
    detail: "Identify the topic, intent, and safety context.",
  },
  {
    label: "Search",
    current: "Browsing trusted medical sources",
    detail: "Pull official labels, papers, trials, and health context.",
  },
  {
    label: "Rank",
    current: "Ranking the evidence",
    detail: "Prefer direct, high-quality, claim-relevant sources.",
  },
  {
    label: "Answer",
    current: "Writing the cited answer",
    detail: "Attach citations only where sources support claims.",
  },
];

export function summarizeQuestionFocus(question: string): string {
  const normalized = question.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_FOCUS_CHARS) return normalized || "your question";
  const clipped = normalized.slice(0, MAX_FOCUS_CHARS - 3);
  const boundary = clipped.lastIndexOf(" ");
  return `${(boundary > 24 ? clipped.slice(0, boundary) : clipped).trim()}...`;
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
    current: step.current,
    preview,
    steps: THINKING_STEPS,
  };
}
