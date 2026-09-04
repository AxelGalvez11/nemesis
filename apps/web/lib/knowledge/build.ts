"use client";

// Where the map's nodes come from.
//
// 🔴 TWO SOURCES, AND UPLOADS ARE NOT ONE OF THEM. See `graph.ts` for the owner's ruling. This
// module reads STARTED COURSES (territory the learner deliberately took on) and LEARNER EVIDENCE
// (things they have shown). It deliberately does not touch `knowledge_objects` or
// `learning_objectives` rows that came out of a dropped document.
//
// 🔴 A SECTION IS THE NODE, NOT AN OBJECTIVE. 22,452 objectives is not a map, it is a spreadsheet.
// A section has a name a person recognises, sits inside a named chapter, and carries two to five
// objectives — which makes it exactly the grain at which "how am I doing here" is a fair question.
// Its weight is how many objectives it holds, so a section with five reads bigger than one with two.
//
// 🔴 STATE IS CURRENTLY ALWAYS `unshown`, AND THAT IS HONEST RATHER THAN UNFINISHED. Filling a node
// in requires evidence tied to that section's objectives, and two things must ship before any
// exists: minting course objectives into `learning_objectives` when a course starts, and recording
// demonstrations from ordinary chat. Until then this map shows the shape of what a learner has
// taken on and says plainly that nothing has been demonstrated. It never guesses a state, and it
// never colours a node because a document mentioned it.

import { supabase } from "@/lib/supabase";
import type { KnowledgeNode } from "./graph";

interface SectionRow {
  ordinal: number;
  title: string;
  unit: string | null;
  chapter: string | null;
  objectives: unknown;
  course_id: string;
}

/** Trim a book's own numbering off a label: "Chapter 4 The Heart" reads better as "The Heart". */
function tidy(label: string): string {
  return label
    .replace(/^(Chapter|Unit|Part|Module)\s*\d+[:.\s-]*/i, "")
    .replace(/^\d+(\.\d+)*[:.\s-]+/, "")
    .trim();
}

export async function buildKnowledgeNodes(userId: string | null): Promise<KnowledgeNode[]> {
  if (!userId) return [];

  const { data: started, error: startedError } = await supabase
    .from("learner_courses")
    .select("course_id");
  if (startedError || !started?.length) return [];

  const courseIds = started.map((r) => String(r.course_id));
  const { data: sections, error: sectionsError } = await supabase
    .from("course_sections")
    .select("course_id,ordinal,title,unit,chapter,objectives")
    .in("course_id", courseIds)
    .order("ordinal", { ascending: true });
  if (sectionsError || !sections) return [];

  const nodes: KnowledgeNode[] = [];
  for (const raw of sections as unknown as SectionRow[]) {
    const objectives = Array.isArray(raw.objectives) ? (raw.objectives as string[]) : [];
    // A section that states nothing to be able to do is not a place on a knowledge map: there is
    // no question it could ever answer about the learner.
    if (objectives.length === 0) continue;
    const region = tidy(raw.unit || raw.chapter || "Other") || "Other";
    nodes.push({
      id: `${raw.course_id}:${raw.ordinal}`,
      label: tidy(raw.title) || raw.title,
      region,
      weight: objectives.length,
      state: "unshown",
      can: [],
      needs: objectives,
    });
  }
  return nodes;
}
