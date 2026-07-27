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

// Skills — the same "one click seeds a proven recipe" idea as Playbooks, but a Skill produces a
// DELIVERABLE (a slide deck, a systematic-review report) rather than only seeding a question. Pure
// data: `action` is a tag the composer switches on; there is no function here, no fetch. "soon" is an
// honest not-yet-built entry (disabled in the menu), matching the app's other coming-soon rows.
export type SkillAction = "slides" | "structured_review" | "soon";

export interface Skill {
  id: string;
  title: string; // menu row label
  desc: string;  // short right-aligned hint
  action: SkillAction;
}

export const SKILLS: readonly Skill[] = [
  {
    id: "slides",
    title: "Slides",
    desc: "cited research → PowerPoint",
    action: "slides",
  },
  {
    id: "systematic-review",
    title: "Systematic review",
    desc: "documented method + tables",
    action: "structured_review",
  },
  {
    id: "journal-club",
    title: "Journal club",
    desc: "Soon",
    action: "soon",
  },
] as const;
