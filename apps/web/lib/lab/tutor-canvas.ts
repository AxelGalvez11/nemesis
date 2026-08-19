"use client";

/**
 * The Lab's canvas — Nemesis Lab §8.
 *
 * 🔴 IT IS BUILT BY THE PRODUCTION FUNCTIONS, IN THE PRODUCTION ORDER. `loadCanonicalSource` reads
 * the stored parse (never the one held in a browser tab, which is a different object and would make
 * the Tutor Lab teach from something no learner ever gets); `excerptsFromSourceContext` cuts it into
 * the same excerpts a real attachment produces; `mergeSourceIntoCanvas` folds it in; `saveCanvas`
 * writes the row. There is no lab-only canvas shape, and there must never be one — a Tutor Lab
 * teaching from a canvas production cannot produce would answer a question nobody asked.
 *
 * 🔴 AND IT REUSES THE SAME CANVAS FOR THE SAME SOURCE. Learner state is the point of this half of
 * the Lab (§11), and a fresh canvas per visit would restart the session every reload, so "partially
 * known" and "holds a misconception" could never be reached by using the product.
 */

import { excerptsFromSourceContext } from "@/lib/learn/canvas-grounding";
import type { CanvasSource, LearningCanvas } from "@/lib/learn/canvas-model";
import { loadCanonicalSource } from "@/lib/learn/canvas-sources";
import { listCanvases, loadCanvas, mergeSourceIntoCanvas, newCanvas, saveCanvas } from "@/lib/learn/canvas-store";
import { supabase } from "@/lib/supabase";

/** The title the Lab gives its canvases, so one can be found again for the same source. */
export function labCanvasTitle(fileName: string): string {
  return `Lab: ${fileName}`;
}

export type LabCanvasResult =
  | { ok: true; canvas: LearningCanvas; reused: boolean }
  | { ok: false; error: string };

/**
 * The canvas for this source, created on first use and reused afterwards.
 *
 * `reused` is reported rather than hidden: "the learner already knows some of this" and "this is a
 * brand new session" produce very different teaching, and the panel has to be able to say which.
 */
export async function ensureLabCanvas(uid: string, librarySourceId: string): Promise<LabCanvasResult> {
  const row = await supabase
    .from("library_sources")
    .select("id,file_name")
    .eq("id", librarySourceId)
    .maybeSingle();
  const fileName = (row.data as { file_name?: string } | null)?.file_name ?? "source";
  const title = labCanvasTitle(fileName);

  const existing = await listCanvases(uid);
  const match = existing.find((summary) => summary.title === title);
  if (match) {
    const loaded = await loadCanvas(uid, match.id);
    if (loaded) return { canvas: loaded, ok: true, reused: true };
  }

  const canonical = await loadCanonicalSource(librarySourceId);
  if (!canonical.ok) {
    return {
      error:
        canonical.reason === "not-parsed"
          ? "That source has no stored parse yet. Inspect it in the Parser tab and press “Open in Tutor Lab” again."
          : canonical.reason === "unreadable"
            ? "Nemesis read that file and found nothing it could turn into units, so there is nothing to teach from."
            : "That source does not exist for the Lab learner.",
      ok: false,
    };
  }

  const sourceId = "s1";
  const source: CanvasSource = {
    durability: "durable",
    excerpts: excerptsFromSourceContext(sourceId, canonical.context),
    id: sourceId,
    kind: canonical.context.sourceKind,
    librarySourceId,
    parseQuality: canonical.context.quality,
    title: fileName,
  };

  const canvas = mergeSourceIntoCanvas({ ...newCanvas(), title }, source);
  await saveCanvas(uid, canvas);
  return { canvas, ok: true, reused: false };
}

/**
 * The Lab learner's objective rows.
 *
 * 🔴 A PLAIN READ OF `learning_objectives`, NOT A REIMPLEMENTATION OF ANYTHING. The rows are minted
 * by `saveKnowledge` on the production path; this only needs their ids in order to attach seeded
 * evidence to them, and evidence points at the ROW id rather than at the identity key.
 */
export async function labObjectiveRows(uid: string): Promise<{ id: string; identityKey: string; label: string }[]> {
  const { data, error } = await supabase
    .from("learning_objectives")
    .select("id,identity_key,label")
    .eq("user_id", uid);
  if (error || !data) return [];
  return (data as { id: string; identity_key: string; label: string }[]).map((row) => ({
    id: row.id,
    identityKey: row.identity_key,
    label: row.label,
  }));
}
