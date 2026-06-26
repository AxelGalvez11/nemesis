export type ClaimRelation = "supports" | "partial" | "mentions" | "conflicts" | "reviewed";

export const CLAIM_RELATION_LABEL: Record<ClaimRelation, string> = {
  supports: "Supports",
  partial: "Partial",
  mentions: "Mentions",
  conflicts: "Conflicts",
  reviewed: "Reviewed",
};
