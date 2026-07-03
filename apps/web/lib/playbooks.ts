// Playbooks — curated, deterministic task recipes (the Manus pattern): one click seeds the composer
// with a proven question AND arms the right tool. Pure data; no LLM, no fetch.

export interface Playbook {
  id: string;
  title: string;     // short chip label
  question: string;  // the seeded composer text
  tool: "deep" | "discovery";
}

export const PLAYBOOKS: readonly Playbook[] = [
  {
    id: "evidence-brief",
    title: "Evidence brief on a drug",
    question: "What does the current human evidence say about tirzepatide for weight loss — efficacy, safety, and open questions?",
    tool: "deep",
  },
  {
    id: "claim-check-deep",
    title: "Deep-check a viral claim",
    question: "Is it true that creatine causes hair loss? Review the primary evidence for and against.",
    tool: "deep",
  },
  {
    id: "head-to-head",
    title: "Compare two treatments",
    question: "How does semaglutide compare with tirzepatide for weight loss in adults — pooled efficacy and adverse events?",
    tool: "deep",
  },
  {
    id: "research-gaps",
    title: "Find the research gaps",
    question: "Where are the research gaps in using GLP-1 receptor agonists for alcohol use disorder?",
    tool: "discovery",
  },
] as const;
