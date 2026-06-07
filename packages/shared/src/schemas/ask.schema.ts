import { z } from "zod";

export const AskBodySchema = z.object({
  question: z.string().trim().min(1).max(2000),
  use_health_context: z.boolean().optional(),
  conversation_id: z.string().uuid().optional(),
});

export type AskBody = z.infer<typeof AskBodySchema>;
