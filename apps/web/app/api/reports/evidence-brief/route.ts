import type { AskResponse, Citation, EvidenceBriefResponse } from "@pharmabro/shared";
import { adminClient, json, verifyBearer } from "@/lib/server";

interface StoredAnswerRow {
  id: string;
  user_id: string;
  question: string;
  answer: AskResponse;
  evidence_grade: string | null;
  source_ids: unknown;
  created_at: string;
}

interface RequestBody {
  answer_id?: string;
  depth?: "brief" | "deep";
}

export async function POST(req: Request) {
  try {
    const user = await verifyBearer(req);
    if (!user) return json({ error: "authentication required" }, 401);

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid json" }, 400);
    }

    const answerId = body.answer_id?.trim();
    if (!answerId) return json({ error: "answer_id required" }, 400);

    if (body.depth === "deep") {
      return json({
        error: "deep_research_not_enabled",
        message: "Deep research is a future Pro workflow. Generate an evidence brief from this cited answer for now.",
      }, 402);
    }

    const admin = adminClient();
    const { data: stored, error: answerError } = await admin
      .from("generated_answers")
      .select("id,user_id,question,answer,evidence_grade,source_ids,created_at")
      .eq("id", answerId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (answerError) throw answerError;
    if (!stored) return json({ error: "answer not found" }, 404);

    const row = stored as StoredAnswerRow;
    const quota = await consumeReportQuota(admin, user.id, answerId);
    if (!quota.allowed) {
      return json({
        error: "quota_exceeded",
        counter_key: quota.counter_key,
        used: quota.used,
        limit: quota.limit,
        plan: quota.plan,
      }, 429);
    }

    const report = buildEvidenceBrief(row);
    const { data: saved, error: saveError } = await admin
      .from("saved_reports")
      .insert({
        user_id: user.id,
        title: report.title,
        kind: "evidence_brief",
        ref_id: row.id,
        payload: report,
        status: "completed",
        report_depth: "brief",
        generated_from_answer_id: row.id,
        source_ids: normalizedSourceIds(row.source_ids),
        citation_count: report.citations.length,
        export_formats: report.export_formats,
        completed_at: report.created_at,
      })
      .select("id,created_at")
      .single();

    if (saveError) throw saveError;

    return json({
      ...report,
      report_id: saved.id,
      created_at: saved.created_at,
    } satisfies EvidenceBriefResponse);
  } catch (error) {
    console.error("evidence_brief_failed", error);
    return json({ error: "evidence_brief_failed" }, 500);
  }
}

function buildEvidenceBrief(row: StoredAnswerRow): EvidenceBriefResponse {
  const answer = row.answer;
  const citations = Array.isArray(answer.citations) ? answer.citations : [];
  const title = titleFromQuestion(row.question);
  const sections = [
    {
      title: "Key Takeaway",
      bullets: compact([answer.plain_english_summary]),
    },
    {
      title: "What The Evidence Says",
      bullets: compact(answer.answer_sections?.what_we_know?.map((p) => p.text) ?? []),
    },
    {
      title: "Safety And Caveats",
      bullets: compact([
        ...(answer.answer_sections?.safety_notes?.map((p) => p.text) ?? []),
        ...(answer.answer_sections?.what_we_do_not_know?.map((p) => p.text) ?? []),
      ]),
    },
    {
      title: "Questions To Bring To A Clinician",
      bullets: compact(answer.answer_sections?.questions_to_ask ?? []),
    },
  ].filter((section) => section.bullets.length > 0);

  return {
    report_id: "",
    kind: "evidence_brief",
    depth: "brief",
    status: "completed",
    title,
    summary: answer.plain_english_summary,
    evidence_grade: answer.evidence_grade,
    sections,
    citations: citations.map(normalizeCitation),
    source_count: new Set(citations.map((c) => c.source_id)).size,
    generated_from_answer_id: row.id,
    export_formats: ["markdown"],
    created_at: new Date().toISOString(),
  };
}

async function consumeReportQuota(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  answerId: string,
): Promise<{
  allowed: boolean;
  counter_key: string;
  used: number;
  limit: number | null;
  plan: string;
}> {
  const { data, error } = await admin.rpc("consume_usage", {
    p_user_id: userId,
    p_counter_key: "evidence_brief_daily",
    p_cost: 1,
    p_metadata: { feature: "evidence_brief", answer_id: answerId },
  });
  if (error) throw error;
  const value = data as {
    allowed?: boolean;
    counter_key?: string;
    used?: number;
    limit?: number | null;
    plan?: string;
  } | null;
  return {
    allowed: value?.allowed === true,
    counter_key: value?.counter_key ?? "evidence_brief_daily",
    used: Number(value?.used ?? 0),
    limit: typeof value?.limit === "number" ? value.limit : null,
    plan: value?.plan ?? "free",
  };
}

function titleFromQuestion(question: string): string {
  const cleaned = question.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Evidence Brief";
  return cleaned.length > 84 ? `${cleaned.slice(0, 81)}...` : cleaned;
}

function compact(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean).slice(0, 8);
}

function normalizedSourceIds(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function normalizeCitation(citation: Citation): Citation {
  return {
    chunk_tag: citation.chunk_tag,
    source_id: citation.source_id,
    source_type: citation.source_type,
    title: citation.title,
    section: citation.section,
    url: citation.url,
    license: citation.license,
    published_date: citation.published_date,
    retrieved_at: citation.retrieved_at,
  };
}
