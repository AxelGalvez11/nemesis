import type {
  DiscoveryClaim,
  DiscoveryReport,
  ResearchGap,
  ResearchHypothesis,
  SuggestedStudyDesign,
} from "../../../packages/shared/src/discovery.ts";
import type { ResearchReport } from "../../../packages/shared/src/research.ts";

interface PersistDiscoveryArgs {
  sbUrl: string;
  serviceKey: string;
  userId: string;
  runId: string;
  savedReportId: string | null;
  report: ResearchReport;
}

interface DbId {
  id: string;
}

interface ClaimDbId extends DbId {
  client_claim_id: string;
}

interface GapDbId extends DbId {
  client_gap_id: string;
}

interface HypothesisDbId extends DbId {
  client_hypothesis_id: string;
  hypothesis: string;
}

export async function persistDiscoveryProject(
  args: PersistDiscoveryArgs,
): Promise<string | null> {
  const discovery = args.report.discovery;
  if (!discovery) return null;
  try {
    const projectRows = await insertRows<DbId>(args, "research_projects", [{
      user_id: args.userId,
      saved_report_id: args.savedReportId,
      research_report_run_id: args.runId,
      title: discovery.project_title,
      question: discovery.question,
      topic: discovery.monitor_terms[0] ?? null,
      status: "active",
      current_grade: discovery.evidence_meter,
      summary: discovery.summary,
      monitor_terms: discovery.monitor_terms,
      metadata: {
        report_mode: args.report.mode ?? "discovery",
        generated_at: discovery.generated_at,
        claim_count: discovery.claims.length,
        study_count: discovery.study_characteristics.length,
      },
    }], "id");
    const projectId = projectRows[0]?.id;
    if (!projectId) return null;

    const claimIds = await persistClaims(args, projectId, discovery);
    await persistStudyCharacteristics(args, projectId, discovery);
    const gapIds = await persistGaps(args, projectId, discovery, claimIds);
    const hypothesisIds = await persistHypotheses(
      args,
      projectId,
      discovery.hypotheses,
      gapIds,
    );
    await persistStudyDesigns(
      args,
      projectId,
      discovery.study_designs,
      hypothesisIds,
    );
    await insertRows(args, "evidence_updates", [{
      project_id: projectId,
      claim_id: null,
      change_type: "new_source",
      summary:
        `Initial discovery map created from ${args.report.citations.length} cited source${
          args.report.citations.length === 1 ? "" : "s"
        }.`,
      old_grade: null,
      new_grade: discovery.evidence_meter,
      source_id: null,
      source_url: null,
      review_status: "pending",
      metadata: {
        report_mode: args.report.mode ?? "discovery",
        saved_report_id: args.savedReportId,
      },
    }], "id");
    return projectId;
  } catch (e) {
    console.error("discovery persistence failed:", (e as Error).message);
    return null;
  }
}

async function persistClaims(
  args: PersistDiscoveryArgs,
  projectId: string,
  discovery: DiscoveryReport,
): Promise<Map<string, string>> {
  const claimRows = discovery.claims.map((c) => ({
    project_id: projectId,
    client_claim_id: c.id,
    claim_text: c.claim_text,
    normalized_claim: c.normalized_claim,
    verdict: c.verdict,
    confidence: c.confidence,
    evidence_grade: c.evidence_grade,
    rationale: c.rationale ?? null,
    metadata: { evidence_links: c.evidence.length },
  }));
  const insertedClaims = await insertRows<ClaimDbId>(
    args,
    "research_claims",
    claimRows,
    "id,client_claim_id",
  );
  const claimIds = new Map(
    insertedClaims.map((c) => [c.client_claim_id, c.id]),
  );

  const evidenceRows = discovery.claims.flatMap((claim) => {
    const claimId = claimIds.get(claim.id);
    if (!claimId) return [];
    return claim.evidence.map((e) => ({
      claim_id: claimId,
      citation_tag: e.citation_tag,
      source_id: e.source_id,
      chunk_id: e.citation_tag,
      relation: e.relation,
      evidence_weight: clampEvidenceWeight(e.evidence_weight),
      support_quote: e.support_quote ?? null,
      metadata: {},
    }));
  });
  await insertRows(args, "claim_evidence", evidenceRows, "id");

  await insertRows(
    args,
    "evidence_ratings",
    discovery.claims.flatMap((claim) => {
      const claimId = claimIds.get(claim.id);
      if (!claimId) return [];
      return [{
        claim_id: claimId,
        evidence_grade: claim.evidence_grade,
        support_score: supportScore(claim),
        certainty: claim.confidence,
        reason: claim.rationale ?? null,
        rating_inputs: {
          verdict: claim.verdict,
          evidence_count: claim.evidence.length,
          relations: claim.evidence.map((e) => e.relation),
        },
      }];
    }),
    "id",
  );

  await insertRows(
    args,
    "claim_versions",
    discovery.claims.flatMap((claim) => {
      const claimId = claimIds.get(claim.id);
      if (!claimId) return [];
      return [{
        claim_id: claimId,
        version_no: 1,
        verdict: claim.verdict,
        confidence: claim.confidence,
        evidence_grade: claim.evidence_grade,
        support_score: supportScore(claim),
        change_reason: "Initial discovery run",
        snapshot: claim,
      }];
    }),
    "id",
  );
  return claimIds;
}

async function persistStudyCharacteristics(
  args: PersistDiscoveryArgs,
  projectId: string,
  discovery: DiscoveryReport,
): Promise<void> {
  await insertRows(
    args,
    "study_characteristics",
    discovery.study_characteristics.map((s) => ({
      project_id: projectId,
      citation_tag: s.citation_tag,
      source_id: s.source_id,
      title: s.title,
      study_type: s.study_type,
      population: s.population ?? null,
      sample_size: s.sample_size ?? null,
      intervention: s.intervention ?? null,
      comparator: s.comparator ?? null,
      duration: s.duration ?? null,
      outcomes: s.outcomes,
      limitations: s.limitations,
      metadata: {},
    })),
    "id",
  );
}

async function persistGaps(
  args: PersistDiscoveryArgs,
  projectId: string,
  discovery: DiscoveryReport,
  claimIds: Map<string, string>,
): Promise<Map<string, string>> {
  const rows = discovery.research_gaps.map((gap) => ({
    project_id: projectId,
    client_gap_id: gap.id,
    dimension: gap.dimension,
    severity: gap.severity,
    description: gap.description,
    rationale: gap.rationale,
    related_claim_ids: relatedClaimUuids(gap, claimIds),
    source_tags: gap.source_tags,
    metadata: {},
  }));
  const inserted = await insertRows<GapDbId>(
    args,
    "research_gaps",
    rows,
    "id,client_gap_id",
  );
  return new Map(inserted.map((g) => [g.client_gap_id, g.id]));
}

async function persistHypotheses(
  args: PersistDiscoveryArgs,
  projectId: string,
  hypotheses: ResearchHypothesis[],
  gapIds: Map<string, string>,
): Promise<Map<string, string>> {
  const rows = hypotheses.map((h) => ({
    project_id: projectId,
    gap_id: h.gap_id ? gapIds.get(h.gap_id) ?? null : null,
    client_hypothesis_id: h.id,
    hypothesis: h.hypothesis,
    why_plausible: h.why_plausible,
    evidence_basis: h.evidence_basis,
    uncertainty: h.uncertainty,
    priority: h.priority,
    metadata: {},
  }));
  const inserted = await insertRows<HypothesisDbId>(
    args,
    "research_hypotheses",
    rows,
    "id,client_hypothesis_id,hypothesis",
  );
  return new Map(inserted.map((h) => [h.client_hypothesis_id, h.id]));
}

async function persistStudyDesigns(
  args: PersistDiscoveryArgs,
  projectId: string,
  designs: SuggestedStudyDesign[],
  hypothesisIds: Map<string, string>,
): Promise<void> {
  await insertRows(
    args,
    "study_designs",
    designs.map((d) => ({
      project_id: projectId,
      hypothesis_id: hypothesisIds.get(hypothesisClientIdFromDesign(d)) ?? null,
      client_design_id: d.id,
      design_type: d.design_type,
      research_question: d.research_question,
      hypothesis: d.hypothesis,
      population: d.population,
      intervention: d.intervention,
      comparator: d.comparator,
      primary_endpoint: d.primary_endpoint,
      secondary_endpoints: d.secondary_endpoints,
      duration: d.duration,
      sample_size_notes: d.sample_size_notes,
      safety_monitoring: d.safety_monitoring,
      feasibility: d.feasibility,
      ethics: d.ethics,
      metadata: {},
    })),
    "id",
  );
}

function hypothesisClientIdFromDesign(d: SuggestedStudyDesign): string {
  return d.id.replace(/^design-/, "hypothesis-");
}

function relatedClaimUuids(
  gap: ResearchGap,
  claimIds: Map<string, string>,
): string[] {
  return gap.related_claim_ids.map((id) => claimIds.get(id)).filter((
    id,
  ): id is string => Boolean(id));
}

function supportScore(claim: DiscoveryClaim): number {
  if (!claim.evidence.length) return 0;
  return Math.round(
    Math.max(
      ...claim.evidence.map((e) => clampEvidenceWeight(e.evidence_weight)),
    ),
  );
}

function clampEvidenceWeight(n: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
}

async function insertRows<T>(
  args: PersistDiscoveryArgs,
  table: string,
  rows: Array<Record<string, unknown>>,
  select: string,
): Promise<T[]> {
  if (!rows.length) return [];
  const url = new URL(`${args.sbUrl}/rest/v1/${table}`);
  url.searchParams.set("select", select);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: args.serviceKey,
      Authorization: `Bearer ${args.serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(
      `insert ${table} failed (${res.status}): ${
        (await res.text()).slice(0, 200)
      }`,
    );
  }
  return await res.json() as T[];
}
