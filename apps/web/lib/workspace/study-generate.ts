// Batch C generation orchestrator — mirrors the notebook deliverables flow
// (lib/notebooks/deliverables.ts): create a pending row so the tab shows a
// draft immediately, run one non-streaming metered completion, then flip the
// row ready with typed content (or delete the shell on failure). Prompts,
// parsing, and content shapes live in study-artifact-content.ts.

import { postChatCompletion } from "@/lib/workspace/chat-api";
import { apportion, chunkMaterial, interleave, mergeOutlines } from "@/lib/workspace/material-chunks";
import {
  buildMindmapGenMessages,
  buildTestGenMessages,
  parseGeneratedMindmap,
  parseGeneratedTest,
  type StudyMaterial,
} from "@/lib/workspace/study-artifact-content";
import type { CreateArtifactInput, StudyArtifact } from "@/lib/workspace/study-cloud-store";

/** How many chunk calls run at once. Small: these are metered completions against
 *  the student's own allowance, and a burst is what a rate limit is for. */
const GENERATION_CONCURRENCY = 2;

export interface GenerateStudyArtifactOpts {
  uid: string;
  kind: "test" | "mindmap";
  title: string;
  groupName?: string;
  material: StudyMaterial;
  questionCount?: number;
  createArtifact: (input: CreateArtifactInput) => Promise<StudyArtifact>;
  updateArtifact: (artifactId: string, patch: { content?: unknown; status?: "draft" | "ready" }) => Promise<void>;
  deleteArtifact: (artifactId: string) => Promise<void>;
}

/** Generate one test or mindmap. Returns the ready artifact id. Throws a
 *  student-readable error after cleaning up the pending shell. */
export async function generateStudyArtifact(opts: GenerateStudyArtifactOpts): Promise<string> {
  if (!opts.material.text.trim()) {
    throw new Error("That source has no content to work from yet.");
  }
  const row = await opts.createArtifact({
    groupName: opts.groupName,
    kind: opts.kind,
    title: opts.title,
  });
  try {
    // A lecture is usually longer than one prompt. Reading only the first 9,000
    // characters produced tests that never mentioned the second half of the class —
    // and looked complete. Every chunk is read, and the results are interleaved so a
    // trimmed test still spans the whole source. See lib/workspace/material-chunks.ts.
    const chunks = chunkMaterial(opts.material.text);
    const wanted = opts.questionCount ?? 10;
    const quotas = apportion(wanted, chunks.map((chunk) => chunk.length));

    const ask = async (chunk: string, quota: number): Promise<string | null> => {
      const material: StudyMaterial = { ...opts.material, text: chunk };
      const messages = opts.kind === "test"
        ? buildTestGenMessages(material, quota)
        : buildMindmapGenMessages(material);
      const reply = await postChatCompletion(opts.uid, messages, {
        decision: { model: "deepseek-chat", route: "conversation", searchWeb: false },
      });
      if (!reply.text && chunks.length === 1) {
        throw new Error(reply.errorText ?? "The engine couldn't generate that. Try again.");
      }
      // One chunk failing costs its own share of the material and nothing else.
      return reply.text || null;
    };

    const replies: Array<string | null> = [];
    for (let index = 0; index < chunks.length; index += GENERATION_CONCURRENCY) {
      const slice = chunks.slice(index, index + GENERATION_CONCURRENCY);
      const batch = await Promise.all(
        slice.map((chunk, offset) => ask(chunk, quotas[index + offset] ?? wanted)),
      );
      replies.push(...batch);
    }

    if (opts.kind === "test") {
      const perChunk = replies.map((reply) => (reply ? parseGeneratedTest(reply) : []));
      const questions = interleave(perChunk, wanted);
      if (questions.length === 0) throw new Error("The engine's reply wasn't a usable test. Try again.");
      await opts.updateArtifact(row.id, { content: { attempts: [], questions }, status: "ready" });
    } else {
      const outlines = replies.flatMap((reply) => {
        const outline = reply ? parseGeneratedMindmap(reply) : null;
        return outline ? [outline] : [];
      });
      const outline = mergeOutlines(outlines);
      if (!outline) throw new Error("The engine's reply wasn't a usable mind map. Try again.");
      await opts.updateArtifact(row.id, { content: { outline }, status: "ready" });
    }
    return row.id;
  } catch (cause) {
    await opts.deleteArtifact(row.id).catch(() => undefined);
    throw cause instanceof Error ? cause : new Error("The engine couldn't generate that. Try again.");
  }
}
