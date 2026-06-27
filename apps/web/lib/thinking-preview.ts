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
    current: "Finding relevant sources",
    detail: "Pull official labels, papers, and evidence context.",
  },
  {
    label: "Rank",
    current: "Ranking the evidence",
    detail: "Prefer direct, high-quality, recent sources.",
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
    `You are asking about "${focus}". This is a brief work preview, not private reasoning.`,
    `Looking for official safety sources, medical literature, and source context that directly match "${focus}".`,
    "Comparing source quality, recency, and direct support before any clinical claim appears.",
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
