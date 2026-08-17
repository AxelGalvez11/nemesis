/**
 * Production proof for the full figure-learning chain.
 *
 * The harness creates a deterministic labelled diagram, embeds it in a PowerPoint, uploads and
 * parses that deck through the production application, verifies that pixels + labels become
 * spatial knowledge, asks the production occlusion reader for masks, and records a correctly
 * judged locate answer through the ordinary learner-evidence path.
 *
 * It is intentionally inert without an exact confirmation because a run sends synthetic image
 * pixels to the configured parser/vision providers, makes paid model calls, and creates temporary
 * production rows. All known storage objects and the temporary learner are removed in `finally`.
 *
 * Usage, from apps/web:
 *
 *   PRODUCTION_ACCEPTANCE_CONFIRM="temporary-user-paid-model-calls-approved" \
 *   ACCEPTANCE_APP_URL=https://app.enternemesis.com \
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *   SUPABASE_SERVICE_KEY=... pnpm exec tsx scripts/figure-occlusion-acceptance.ts
 */
import { createCanvas } from "@napi-rs/canvas";
import type { DocumentModel } from "@nemesis/shared";
import pptxgen from "pptxgenjs";

import { supabase } from "@/lib/supabase";
import { emptyCanvas } from "@/lib/learn/canvas-model";
import { evaluateLearningResponse } from "@/lib/learn/canvas-api";
import { extractKnowledgeObjects } from "@/lib/learn/knowledge-extraction";
import { projectLearnerState } from "@/lib/learn/learner-evidence";
import { loadEvidence, recordEvidence, saveKnowledge } from "@/lib/learn/learner-store";
import {
  evidenceForSubmission,
  judgementOf,
  objectiveAsTask,
  outcomeFor,
  retrievalPromptFor,
} from "@/lib/learn/objective-task";
import { sourceContextFromModel } from "@/lib/sources/source-context";
import { deviceKey } from "@/lib/workspace/chat-api";
import { uploadLibrarySource } from "@/lib/workspace/library-sources";

const CONFIRMATION = "temporary-user-paid-model-calls-approved";
const PARSE_TIMEOUT_MS = 8 * 60_000;
const POLL_MS = 3_000;

let failures = 0;
function check(id: string, pass: boolean, detail = ""): void {
  if (!pass) failures += 1;
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function appOrigin(): string {
  const raw = required("ACCEPTANCE_APP_URL");
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("ACCEPTANCE_APP_URL must use https");
  return url.origin;
}

function diagramPng(): Buffer {
  const canvas = createCanvas(1600, 900);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#F8FAFC";
  ctx.fillRect(0, 0, 1600, 900);

  ctx.fillStyle = "#111827";
  ctx.font = "bold 58px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("CELLULAR ENERGY PATHWAY", 800, 105);

  const nodes = [
    { color: "#DBEAFE", label: "GLUCOSE", x: 90 },
    { color: "#DCFCE7", label: "PYRUVATE", x: 590 },
    { color: "#FDE68A", label: "ATP", x: 1090 },
  ];
  for (const node of nodes) {
    ctx.fillStyle = node.color;
    ctx.strokeStyle = "#1E3A8A";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.roundRect(node.x, 330, 420, 230, 36);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#0F172A";
    ctx.font = "bold 56px sans-serif";
    ctx.fillText(node.label, node.x + 210, 465);
  }

  ctx.strokeStyle = "#334155";
  ctx.fillStyle = "#334155";
  ctx.lineWidth = 16;
  for (const start of [520, 1020]) {
    ctx.beginPath();
    ctx.moveTo(start, 445);
    ctx.lineTo(start + 55, 445);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(start + 55, 445);
    ctx.lineTo(start + 20, 418);
    ctx.lineTo(start + 20, 472);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = "#475569";
  ctx.font = "36px sans-serif";
  ctx.fillText("Glycolysis transforms glucose into pyruvate, enabling ATP production.", 800, 710);
  return canvas.toBuffer("image/png");
}

async function deckWithDiagram(png: Buffer): Promise<Buffer> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Nemesis production acceptance";
  pptx.subject = "Synthetic labelled diagram for figure-learning acceptance";
  pptx.title = "Cellular energy pathway";
  const slide = pptx.addSlide();
  slide.background = { color: "F8FAFC" };
  slide.addImage({
    data: `data:image/png;base64,${png.toString("base64")}`,
    h: 6.75,
    w: 12,
    x: 0.67,
    y: 0.38,
  });
  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}

async function waitForParse(
  sb: string,
  headers: Record<string, string>,
  sourceId: string,
): Promise<{ parsedDocumentId: string; model: DocumentModel; docKind: string }> {
  const deadline = Date.now() + PARSE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const response = await fetch(
      `${sb}/rest/v1/library_sources?id=eq.${encodeURIComponent(sourceId)}&select=parsed_document_id,parse_error,parse_failed_at`,
      { headers },
    );
    if (!response.ok) throw new Error(`source polling failed (${response.status})`);
    const rows = (await response.json()) as {
      parsed_document_id?: string | null;
      parse_error?: string | null;
      parse_failed_at?: string | null;
    }[];
    const row = rows[0];
    if (row?.parse_failed_at || row?.parse_error) {
      throw new Error(`production parse failed: ${row.parse_error ?? row.parse_failed_at}`);
    }
    if (row?.parsed_document_id) {
      const parsedResponse = await fetch(
        `${sb}/rest/v1/parsed_documents?id=eq.${encodeURIComponent(row.parsed_document_id)}&select=structure,doc_kind,complete,state,error`,
        { headers },
      );
      if (!parsedResponse.ok) throw new Error(`parsed document read failed (${parsedResponse.status})`);
      const parsedRows = (await parsedResponse.json()) as {
        structure?: { model?: DocumentModel };
        doc_kind?: string;
        complete?: boolean;
        state?: string;
        error?: string | null;
      }[];
      const parsed = parsedRows[0];
      if (parsed?.error) throw new Error(`production parse failed: ${parsed.error}`);
      if (parsed?.complete && parsed.structure?.model) {
        return {
          docKind: parsed.doc_kind ?? "pptx",
          model: parsed.structure.model,
          parsedDocumentId: row.parsed_document_id,
        };
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`production parse did not finish within ${PARSE_TIMEOUT_MS / 60_000} minutes`);
}

async function main(): Promise<void> {
  if (process.env.PRODUCTION_ACCEPTANCE_CONFIRM !== CONFIRMATION) {
    throw new Error(
      `Refusing production effects. Set PRODUCTION_ACCEPTANCE_CONFIRM=${CONFIRMATION} only after approval.`,
    );
  }

  const app = appOrigin();
  const sb = required("NEXT_PUBLIC_SUPABASE_URL");
  const anon = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const service = required("SUPABASE_SERVICE_KEY");
  const svc = {
    apikey: service,
    Authorization: `Bearer ${service}`,
    "Content-Type": "application/json",
  };

  let userId: string | null = null;
  let originalPath: string | null = null;
  const figurePaths = new Set<string>();
  try {
    const stamp = crypto.randomUUID();
    const email = `figure-${stamp}@nemesis.test`;
    const password = `Fig-${stamp}-Aa1!`;
    const createResponse = await fetch(`${sb}/auth/v1/admin/users`, {
      body: JSON.stringify({ email, email_confirm: true, password }),
      headers: svc,
      method: "POST",
    });
    const created = (await createResponse.json()) as { id?: string; user?: { id?: string } };
    userId = created.id ?? created.user?.id ?? null;
    if (!createResponse.ok || !userId) {
      throw new Error(`could not seed a learner: ${JSON.stringify(created).slice(0, 240)}`);
    }

    const tokenResponse = await fetch(`${sb}/auth/v1/token?grant_type=password`, {
      body: JSON.stringify({ email, password }),
      headers: { apikey: anon, "Content-Type": "application/json" },
      method: "POST",
    });
    const token = (await tokenResponse.json()) as { access_token?: string; refresh_token?: string };
    if (!tokenResponse.ok || !token.access_token || !token.refresh_token) {
      throw new Error(`could not sign the learner in: ${JSON.stringify(token).slice(0, 240)}`);
    }
    const { error } = await supabase.auth.setSession({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
    });
    if (error) throw new Error(`setSession failed: ${error.message}`);
    check("AUTH", true, `temporary learner ${userId.slice(0, 8)}… signed in`);

    const png = diagramPng();
    const pptx = await deckWithDiagram(png);
    const deckBytes = Uint8Array.from(pptx);
    const file = new File([deckBytes.buffer], "nemesis-figure-acceptance.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    const source = await uploadLibrarySource(userId, file, "Acceptance");
    if (!source) throw new Error("the ordinary Library upload path refused the synthetic deck");
    originalPath = source.storagePath;
    check("UPLOAD", true, `${source.id} · ${pptx.byteLength} bytes`);

    const queued = await fetch(`${app}/api/library/sources/${encodeURIComponent(source.id)}/parse`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      method: "POST",
    });
    const queuedBody = (await queued.json().catch(() => null)) as { decision?: string; error?: string } | null;
    if (!queued.ok) throw new Error(`parse enqueue failed (${queued.status}): ${queuedBody?.error ?? "unknown"}`);
    check("ENQUEUE", true, `production route accepted: ${queuedBody?.decision ?? "queued"}`);

    const parsed = await waitForParse(sb, svc, source.id);
    check("PARSE", true, `${parsed.parsedDocumentId} · ${parsed.model.blocks.length} blocks`);

    const figures = parsed.model.blocks.filter((block) => block.kind === "figure");
    for (const block of figures) {
      if (block.figure?.asset?.path) figurePaths.add(block.figure.asset.path);
    }
    const labelled = figures.filter(
      (block) => (block.figure?.labels?.length ?? 0) >= 2 && Boolean(block.figure?.asset?.path),
    );
    check(
      "FIGURE-LEGIBLE",
      labelled.length > 0,
      `${figures.length} figures · ${labelled.length} carry pixels and at least two labels`,
    );
    if (labelled.length === 0) throw new Error("production parse did not make the labelled figure AI-legible");

    const context = sourceContextFromModel({
      model: parsed.model,
      sourceId: source.id,
      sourceKind: parsed.docKind,
    } as never);
    const spatial = extractKnowledgeObjects(context).objects.find(
      (knowledge) => knowledge.type === "spatial" && Boolean(knowledge.figure?.assetPath),
    );
    check("SPATIAL-KNOWLEDGE", Boolean(spatial), spatial?.statement ?? "none extracted");
    if (!spatial?.figure?.assetPath) throw new Error("no spatial knowledge with loadable pixels was extracted");
    figurePaths.add(spatial.figure.assetPath);

    const download = await supabase.storage.from("library-images").download(spatial.figure.assetPath);
    if (download.error || !download.data) throw new Error(`could not download stored figure: ${download.error?.message}`);
    const storedBytes = new Uint8Array(await download.data.arrayBuffer());
    check("FIGURE-ASSET", storedBytes.byteLength > 0, `${storedBytes.byteLength} stored bytes`);

    const key = await deviceKey(userId);
    if (!key) throw new Error("could not mint a production device key for the temporary learner");
    const form = new FormData();
    form.append("file", new File([storedBytes], "parsed-figure.png", { type: download.data.type || "image/png" }));
    const occlusionResponse = await fetch(`${app}/api/study/occlusion`, {
      body: form,
      headers: { Authorization: `Bearer ${key}` },
      method: "POST",
    });
    const occlusion = (await occlusionResponse.json().catch(() => null)) as {
      boxes?: { x?: number; y?: number; width?: number; height?: number }[];
      error?: string;
      note?: string;
    } | null;
    if (!occlusionResponse.ok) {
      throw new Error(`production occlusion reader failed (${occlusionResponse.status}): ${occlusion?.error ?? "unknown"}`);
    }
    const boxes = Array.isArray(occlusion?.boxes) ? occlusion.boxes : [];
    const normalized = boxes.every((box) =>
      [box.x, box.y, box.width, box.height].every(
        (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1,
      ),
    );
    check("OCCLUSION-MASKS", boxes.length > 0 && normalized, `${boxes.length} normalized masks`);
    if (boxes.length === 0 || !normalized) throw new Error(occlusion?.note ?? "no valid occlusion masks returned");

    const objectives = await saveKnowledge(userId, spatial);
    const objective = objectives.find((candidate) => candidate.capability === "locate");
    if (!objective) throw new Error("spatial knowledge did not persist a locate objective");
    const prompt = retrievalPromptFor({ knowledge: spatial, objective }, crypto.randomUUID());
    check(
      "OCCLUDED-PROMPT",
      !prompt.prompt.toLocaleLowerCase().includes(String(objective.answer).toLocaleLowerCase()),
      prompt.prompt,
    );

    const now = new Date().toISOString();
    const canvas = { ...emptyCanvas(crypto.randomUUID(), now), title: "Figure acceptance" };
    const answer = String(objective.answer);
    const judged = await evaluateLearningResponse(
      userId,
      canvas,
      objectiveAsTask(objective, prompt, { text: answer, tookMs: 1_800, via: "typed" }),
    );
    check(
      "JUDGED",
      Boolean(judged.value),
      judged.value ? `${judged.value.verdict} @ ${judged.value.confidence}` : judged.error ?? "no judgement",
    );
    if (!judged.value) throw new Error(judged.error ?? "production judge returned no evaluation");

    const rows = evidenceForSubmission({
      canvasId: canvas.id,
      judgement: judgementOf([outcomeFor(objective, judged.value)]),
      occurredAt: now,
      prompt,
      responseModality: "typed",
      responseText: answer,
      teachingStrategy: null,
      tookMs: 1_800,
    });
    const writes = await Promise.all(rows.map((row) => recordEvidence(userId, row)));
    check("EVIDENCE-WRITE", writes.length > 0 && writes.every(Boolean), `${writes.length} rows`);
    if (writes.length === 0 || writes.some((written) => !written)) throw new Error("evidence did not persist");

    const evidence = await loadEvidence(userId, objectives);
    const state = projectLearnerState(objective.identityKey, evidence);
    check(
      "LEARNER-MODEL",
      state.demonstrationCount > 0,
      `status=${state.status}, demonstrations=${state.demonstrationCount}`,
    );

    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
    if (failures > 0) process.exitCode = 1;
  } finally {
    if (originalPath) {
      const removed = await supabase.storage.from("library-sources").remove([originalPath]);
      if (removed.error) console.error(`cleanup warning: original ${removed.error.message}`);
    }
    if (figurePaths.size > 0) {
      const removed = await supabase.storage.from("library-images").remove([...figurePaths]);
      if (removed.error) console.error(`cleanup warning: figures ${removed.error.message}`);
    }
    await supabase.auth.signOut().catch(() => undefined);
    if (userId) {
      const cleanup = await fetch(`${sb}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        headers: svc,
        method: "DELETE",
      });
      if (!cleanup.ok) {
        process.exitCode = 1;
        console.error(`cleanup failed for temporary learner ${userId} (${cleanup.status})`);
      } else {
        console.log(`cleanup      deleted temporary learner ${userId}`);
      }
    }
  }
}

void main().catch((error: unknown) => {
  process.exitCode = 1;
  console.error("figure occlusion acceptance failed:", error instanceof Error ? error.message : error);
});
