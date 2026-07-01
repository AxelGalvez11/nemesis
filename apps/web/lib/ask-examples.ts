export const ASK_EXAMPLE_PROMPTS = [
  "is lisinopril safe with spironolactone?",
  "compare berberine and semaglutide for weight loss",
  "why do I have white flakes in my hair?",
  "summarize new evidence on creatine and depression",
  "what sources support isotretinoin and dry skin?",
] as const;

export function askPlaceholderFor(index: number): string {
  const n = ASK_EXAMPLE_PROMPTS.length;
  const wrapped = ((index % n) + n) % n;
  return ASK_EXAMPLE_PROMPTS[wrapped] ?? ASK_EXAMPLE_PROMPTS[0];
}
