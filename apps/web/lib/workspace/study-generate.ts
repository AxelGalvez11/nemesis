// Batch C generation orchestrator — mirrors the notebook deliverables flow
// (lib/notebooks/deliverables.ts): create a pending row so the tab shows a
// draft immediately, run one non-streaming metered completion, then flip the
// row ready with typed content (or delete the shell on failure). Prompts,
// parsing, and content shapes live in study-artifact-content.ts.

import { postChatCompletion } from "@/lib/workspace/chat-api";
import {
  buildMindmapGenMessages,
  buildTestGenMessages,
  parseGeneratedMindmap,
  parseGeneratedTest,
  type StudyMaterial,
  type TestGenOpts,
} from "@/lib/workspace/study-artifact-content";
import type { CreateArtifactInput, StudyArtifact } from "@/lib/workspace/study-cloud-store";

export interface GenerateStudyArtifactOpts {
  uid: string;
  kind: "test" | "mindmap";
  title: string;
  groupName?: string;
  material: StudyMaterial;
  questionCount?: number;
  /** Test papers only: difficulty and re-ask behaviour — see TestGenOpts. */
  testOpts?: TestGenOpts;
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
    const messages = opts.kind === "test"
      ? buildTestGenMessages(opts.material, opts.questionCount ?? 10, opts.testOpts)
      : buildMindmapGenMessages(opts.material);
    const reply = await postChatCompletion(opts.uid, messages, {
      decision: { model: "deepseek-chat", route: "conversation", searchWeb: false },
    });
    if (!reply.text) throw new Error(reply.errorText ?? "The engine couldn't generate that. Try again.");

    if (opts.kind === "test") {
      const questions = parseGeneratedTest(reply.text);
      if (questions.length === 0) throw new Error("The engine's reply wasn't a usable test. Try again.");
      await opts.updateArtifact(row.id, { content: { attempts: [], questions }, status: "ready" });
    } else {
      const outline = parseGeneratedMindmap(reply.text);
      if (!outline) throw new Error("The engine's reply wasn't a usable mind map. Try again.");
      await opts.updateArtifact(row.id, { content: { outline }, status: "ready" });
    }
    return row.id;
  } catch (cause) {
    await opts.deleteArtifact(row.id).catch(() => undefined);
    throw cause instanceof Error ? cause : new Error("The engine couldn't generate that. Try again.");
  }
}
