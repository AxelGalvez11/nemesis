import { z } from "zod";

export const WatchItemTypeSchema = z.enum(["drug", "class", "trial", "company", "keyword"]);

export const WatchlistAddSchema = z.object({
  item_type: WatchItemTypeSchema,
  item_ref: z.string().trim().min(1).max(200),
  alert_types: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
  frequency: z.enum(["instant", "daily", "weekly"]).optional(),
});

export type WatchlistAdd = z.infer<typeof WatchlistAddSchema>;
