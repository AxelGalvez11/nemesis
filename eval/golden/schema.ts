// eval/golden/schema.ts
import { z } from "npm:zod";

export const ProviderId = z.object({
  provider: z.enum(["pubmed_oa", "clinicaltrials", "dailymed", "openfda", "rxnorm", "fda_orange_book"]),
  provider_id: z.string().min(1), // PMID | NCT id | SPL set-id
});
export type ProviderId = z.infer<typeof ProviderId>;

export const GoldenItem = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  intent: z.string().min(1), // e.g. drug_overview, side_effects, drug_interaction
  answerability: z.enum(["answerable", "unanswerable"]),
  expected_sources: z.array(ProviderId).default([]),
  notes: z.string().optional(),
  needs_expert_review: z.boolean().default(true),
  openevidence_slice: z.boolean().default(false),
});
export type GoldenItem = z.infer<typeof GoldenItem>;

export const GoldenSet = z.array(GoldenItem);

export async function loadGolden(path = new URL("./golden-set.json", import.meta.url)): Promise<GoldenItem[]> {
  const raw = JSON.parse(await Deno.readTextFile(path));
  return GoldenSet.parse(raw); // fail-fast on malformed gold
}
