export const BRAIN_RELATIONS = [
  "prerequisite_of",
  "part_of",
  "related_to",
  "contrasts_with",
  "applied_in",
] as const;

export type BrainRelation = (typeof BRAIN_RELATIONS)[number];

export interface LinkProposal {
  confidence: number;
  reason: string;
  relation: BrainRelation;
  target_document_id: string;
}

const RELATION_SET = new Set<string>(BRAIN_RELATIONS);

function objectOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function jsonPayload(raw: string): unknown {
  const trimmed = raw.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/**
 * Treat model output as untrusted input.
 *
 * The model may only propose an edge to one of the exact candidates supplied
 * by retrieval. It cannot nominate a different user's UUID, invent an action,
 * or smuggle arbitrary note edits through the proposal payload.
 */
export function parseLinkProposals(
  raw: string,
  allowedTargetIds: ReadonlySet<string>,
  sourceDocumentId: string,
  limit = 4,
): LinkProposal[] {
  const root = objectOf(jsonPayload(raw));
  const rows = Array.isArray(root?.proposals) ? root.proposals : [];
  const seen = new Set<string>();
  const proposals: LinkProposal[] = [];

  for (const value of rows) {
    const row = objectOf(value);
    if (!row) continue;
    const target = typeof row.target_document_id === "string"
      ? row.target_document_id.trim()
      : "";
    const relation = typeof row.relation === "string"
      ? row.relation.trim()
      : "";
    const reason = typeof row.reason === "string"
      ? row.reason.trim().slice(0, 2_000)
      : "";
    const confidence = Number(row.confidence);

    if (
      !target ||
      target === sourceDocumentId ||
      !allowedTargetIds.has(target) ||
      !RELATION_SET.has(relation) ||
      !reason ||
      !Number.isFinite(confidence) ||
      confidence < 0.55 ||
      confidence > 1
    ) continue;

    const key = `${target}:${relation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    proposals.push({
      confidence,
      reason,
      relation: relation as BrainRelation,
      target_document_id: target,
    });
    if (proposals.length >= Math.max(1, Math.min(limit, 6))) break;
  }

  return proposals;
}

const RELATION_LABEL: Record<BrainRelation, string> = {
  applied_in: "Applied in",
  contrasts_with: "Contrasts with",
  part_of: "Part of",
  prerequisite_of: "Prerequisite of",
  related_to: "Related to",
};

export function proposalMarkdownLine(
  relation: BrainRelation,
  targetTitle: string,
): string {
  const safeTitle = targetTitle
    .replace(/\r?\n/g, " ")
    .replace(/\]\]/g, "")
    .trim()
    .slice(0, 300);
  return `- ${RELATION_LABEL[relation]}: [[${safeTitle}]]`;
}

