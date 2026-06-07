import { z } from "zod";

export const DrugSearchSchema = z.object({
  q: z.string().max(200).optional(),
  status: z.enum(["approved", "investigational", "research_use", "supplement"]).nullable().optional(),
});

export type DrugSearch = z.infer<typeof DrugSearchSchema>;
