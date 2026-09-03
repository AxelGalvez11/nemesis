"use client";

// A ```mermaid mindmap fence in an answer, drawn as the interactive tree instead of a static picture.
//
// 🔴🔴 THE MODEL ALREADY WROTE MIND MAPS; THEY JUST COULD NOT BE TOUCHED. The router has asked for
// a mermaid `mindmap` fence when "the learner asks for a flow chart, diagram, mind map or similar"
// since 2026-08-30, and `mermaid-diagram.tsx` drew it as a strict, inert SVG. Owner, 2026-09-03:
// *"if I want a mind map, I should be able to get one that's interactive, one that I can click on
// and then reveals more nodes."* This routes exactly those fences to `MindmapView` and leaves every
// other diagram (flowchart, sequence, class) on the mermaid path untouched.
//
// 🔴 ONE DOOR TO THE PANEL, BY CONTEXT. The markdown renderer is generic (chat, library, study) and
// must not know what a canvas panel is. A canvas that can host a map provides `MindmapDoor`; the
// block asks for it and shows "Open the map" only when somebody answered. Elsewhere the tree is
// still interactive in place, with no door and no dead button.
//
// 🔴 STREAM-SAFE FOR FREE. A fence still arriving parses to a partial tree, and `MindmapView`
// derives its opened set from the current tree until the learner clicks, so the map grows as the
// answer streams rather than flickering between a code block and a drawing.

import { createContext, useContext, useMemo } from "react";

import { MindmapView } from "@/components/workspace/learn/mindmap-view";
import { type MindmapNode, parseMermaidMindmap, withoutCitationMarks } from "@/lib/learn/mindmap-tree";

export interface MindmapDoor {
  /** Open this tree in the right side panel. */
  open: (root: MindmapNode) => void;
}

const MindmapDoorContext = createContext<MindmapDoor | null>(null);

export const MindmapDoorProvider = MindmapDoorContext.Provider;

export function useMindmapDoor(): MindmapDoor | null {
  return useContext(MindmapDoorContext);
}

/** True when this fence is a mind map rather than any other mermaid diagram. */
export function isMindmapChart(chart: string): boolean {
  return parseMermaidMindmap(chart) !== null;
}

export function MindmapBlock({ chart }: { chart: string }) {
  const door = useMindmapDoor();
  const root = useMemo(() => {
    const parsed = parseMermaidMindmap(chart);
    return parsed ? withoutCitationMarks(parsed) : null;
  }, [chart]);
  if (!root) return null;
  return (
    <div className="my-3" data-canvas-mindmap="">
      <MindmapView onOpen={door ? () => door.open(root) : undefined} root={root} variant="inline" />
    </div>
  );
}
