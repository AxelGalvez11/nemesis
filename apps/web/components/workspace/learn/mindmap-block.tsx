"use client";

// A ```mermaid mindmap fence in an answer: an artifact chip in the conversation, and the interactive
// tree in the side pane.
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

import { Codicon } from "@/components/desktop-ui/codicon";
import { MindmapView } from "@/components/workspace/learn/mindmap-view";
import { type MindmapNode, mindmapStats, parseMermaidMindmap, withoutCitationMarks } from "@/lib/learn/mindmap-tree";

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

/**
 * The chip a map wears in the conversation, the same object the other artifacts are.
 *
 * 🔴🔴 NO TREE INLINE, BY OWNER ORDER (2026-09-03): *"I'm noticing that the mind map is opening
 * in the chat inline. I don't want it to open inline in chat. For mind maps, it should open like
 * the other ones. It should have an inline artifact chip in chat."* Same markup as
 * `ArtifactCard` (the ready line, the icon, the title, the kind), so a map, a deck and a document
 * read as one family; the count line says what is behind the chip. Pressing it opens the pane's
 * map tab; the answer's own auto-open already put it there.
 */
function MindmapChip({ onOpen, root }: { onOpen: () => void; root: MindmapNode }) {
  const stats = mindmapStats(root);
  return (
    <section aria-label="What Nemesis made" className="canvas-swap my-3" data-canvas-mindmap="">
      <p className="m-0 mb-2 text-[length:var(--canvas-text-body)] text-(--ui-text-primary)">
        Mind map ready: <span className="font-medium">{root.label}</span>
      </p>
      <button
        className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary)"
        onClick={onOpen}
        type="button"
      >
        <Codicon className="shrink-0" name="type-hierarchy" size="22px" style={{ color: "var(--ui-kind-green)" }} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">{root.label}</span>
          <span className="text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
            Mind map, {stats.nodes} {stats.nodes === 1 ? "idea" : "ideas"}, {stats.depth} {stats.depth === 1 ? "level" : "levels"} deep
          </span>
        </span>
      </button>
    </section>
  );
}

export function MindmapBlock({ chart }: { chart: string }) {
  const door = useMindmapDoor();
  const root = useMemo(() => {
    const parsed = parseMermaidMindmap(chart);
    return parsed ? withoutCitationMarks(parsed) : null;
  }, [chart]);
  if (!root) return null;
  // 🔴 THE TREE IS DRAWN HERE ONLY WHERE THERE IS NO PANE TO OPEN IT IN (the Library, a preview
  // harness). A chip that opens nothing would be a dead control; a tree in a surface with no pane
  // is the honest fallback.
  if (!door) {
    return (
      <div className="my-3" data-canvas-mindmap="">
        <MindmapView root={root} variant="inline" />
      </div>
    );
  }
  return <MindmapChip onOpen={() => door.open(root)} root={root} />;
}
