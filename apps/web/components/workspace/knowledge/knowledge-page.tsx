"use client";

// Knowledge — the learner's map of what they can do, as a spatial graph.
//
// 🔴 THE SHAPE IS THE OWNER'S PICK. Four directions were drawn (spatial graph, territory, orbit,
// list) and he chose the spatial graph, 2026-09-03: *"i like the spatial graph."* The reason it
// earns the screen over a list is the dashed edges: only a map can show that the thing you are
// weak on sits between two things you already hold.
//
// 🔴 NO SUBTITLE — same ruling as Courses. The title floats over the map, the app's own
// `workspace-page-header-floating` pattern, and the page explains itself.
//
// 🔴 FOUR MARKS, NO NUMBERS. From `docs/minimap-knowledge-territory.md`, owner-authored: "No XP,
// no streaks, no hearts, no large percentages." And the fourth mark exists because of the rule
// directly under it: *source gaps are not learner gaps.* A region Nemesis could not read must
// never render as something the learner failed at, so it gets its own shape and its own colour and
// says so in words.

import { useCallback, useEffect, useMemo, useState } from "react";

import { buildKnowledgeNodes } from "@/lib/knowledge/build";
import {
  hasDemonstrations,
  labelYFor,
  layout,
  regionMarks,
  type KnowledgeNode,
  type NodeState,
  type PlacedNode,
} from "@/lib/knowledge/graph";

const W = 1180;
const H = 900;

function Mark({ state, size = 11 }: { state: NodeState; size?: number }) {
  if (state === "unreadable") {
    return (
      <svg height={size} viewBox="0 0 12 12" width={size}>
        <path d="M6 1.2 10.8 6 6 10.8 1.2 6z" fill="none" stroke="var(--warn)" strokeWidth="1.3" />
      </svg>
    );
  }
  if (state === "solid") {
    return (
      <svg height={size} viewBox="0 0 12 12" width={size}>
        <circle cx="6" cy="6" fill="var(--ui-text-primary)" r="4.6" />
      </svg>
    );
  }
  if (state === "developing") {
    return (
      <svg height={size} viewBox="0 0 12 12" width={size}>
        <circle cx="6" cy="6" fill="none" r="4.6" stroke="var(--ui-text-primary)" strokeWidth="1.3" />
        <path d="M6 1.4a4.6 4.6 0 0 1 0 9.2z" fill="var(--ui-text-primary)" />
      </svg>
    );
  }
  return (
    <svg height={size} viewBox="0 0 12 12" width={size}>
      <circle cx="6" cy="6" fill="none" r="4.6" stroke="var(--ui-text-tertiary)" strokeWidth="1.3" />
    </svg>
  );
}

function NodeGlyph({ node, selected, onSelect }: { node: PlacedNode; selected: boolean; onSelect: () => void }) {
  const common = { onClick: onSelect, style: { cursor: "pointer" } as const };
  if (node.state === "unreadable") {
    return (
      <g transform={`translate(${node.x} ${node.y}) rotate(45)`} {...common}>
        <rect fill="var(--ui-bg-editor)" height={node.r * 1.6} stroke="var(--warn)" strokeWidth="1.7" width={node.r * 1.6} x={-node.r * 0.8} y={-node.r * 0.8} />
      </g>
    );
  }
  return (
    <g transform={`translate(${node.x} ${node.y})`} {...common}>
      {selected ? <circle fill="none" r={node.r + 9} stroke="var(--ui-text-primary)" strokeWidth="1.6" /> : null}
      {node.state === "solid" ? (
        <circle fill="var(--ui-text-primary)" r={node.r} />
      ) : node.state === "developing" ? (
        <>
          <circle fill="var(--ui-bg-editor)" r={node.r} stroke="var(--ui-text-primary)" strokeWidth="1.8" />
          <path d={`M0 ${-node.r}A${node.r} ${node.r} 0 0 1 0 ${node.r}Z`} fill="var(--ui-text-primary)" />
        </>
      ) : (
        <circle fill="var(--ui-bg-editor)" r={node.r} stroke="var(--ui-text-tertiary)" strokeWidth="1.6" />
      )}
    </g>
  );
}

export function KnowledgePage({
  userId,
  nodes: given = null,
}: {
  userId: string | null;
  /**
   * A scripted world, for `/dev-preview/knowledge`.
   *
   * 🔴 THE PREVIEW EXISTS BECAUSE A LEARNER'S MAP IS PRIVATE. `learner_courses` and
   * `learner_evidence` are owner-only by RLS, so a signed-out preview can never show a real
   * populated map — and a map with nothing on it cannot show whether the map WORKS. Same doctrine
   * as the other dev-preview routes in this app: the real component, a hand-written world.
   */
  nodes?: readonly KnowledgeNode[] | null;
}) {
  const [nodes, setNodes] = useState<KnowledgeNode[]>(given ? [...given] : []);
  const [loading, setLoading] = useState(given === null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (given) return;
    let live = true;
    void buildKnowledgeNodes(userId).then((rows) => {
      if (!live) return;
      setNodes(rows);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [userId, given]);

  const map = useMemo(() => layout(nodes, W, H), [nodes]);
  const selected = useMemo(
    () => map.regions.flatMap((r) => r.nodes).find((n) => n.id === selectedId) ?? null,
    [map, selectedId],
  );
  const shown = hasDemonstrations(nodes);
  const select = useCallback((id: string) => setSelectedId((prev) => (prev === id ? null : id)), []);

  return (
    <div className="relative h-full min-w-0 overflow-hidden bg-(--ui-bg-editor) pt-(--titlebar-height)">
      <svg className="absolute inset-0 block h-full w-full" preserveAspectRatio="xMidYMid meet" viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <pattern height="26" id="knowledge-dots" patternUnits="userSpaceOnUse" width="26">
            <circle cx="1.2" cy="1.2" fill="var(--ui-stroke-tertiary)" r="1.2" />
          </pattern>
          <radialGradient cx="50%" cy="50%" id="knowledge-halo" r="50%">
            <stop offset="0%" stopColor="var(--ui-stroke-tertiary)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
        <rect fill="url(#knowledge-dots)" height={H} width={W} />

        {map.regions.map((region) => (
          <g key={region.name}>
            <ellipse cx={region.x} cy={region.y} fill="url(#knowledge-halo)" rx={region.rx} ry={region.ry} />
            {/* spokes: this node belongs to that region. Not a claim about prerequisites. */}
            {region.nodes.map((node) => (
              <line key={`spoke-${node.id}`} stroke="var(--ui-stroke-tertiary)" strokeWidth="1.2" x1={region.x} x2={node.x} y1={region.y} y2={node.y} />
            ))}
            {region.nodes.map((node) => (
              <NodeGlyph key={node.id} node={node} onSelect={() => select(node.id)} selected={node.id === selectedId} />
            ))}
            <text
              fill="var(--ui-text-primary)"
              fontSize="15"
              fontWeight="500"
              textAnchor="middle"
              x={region.x}
              y={labelYFor(region)}
            >
              {region.name}
            </text>
          </g>
        ))}
      </svg>

      {/* floating title, the app's own pattern */}
      <div className="pointer-events-none absolute left-[24px] top-[calc(var(--titlebar-height)+20px)]">
        <h1 className="m-0 text-[28px] font-medium leading-[34px] tracking-[-0.01em] text-(--ui-text-primary)">
          Knowledge
        </h1>
      </div>

      {/* the honest state of things, when there is nothing to draw */}
      {!loading && nodes.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="max-w-[520px] px-[24px] text-center">
            <p className="m-0 text-[16px] leading-[1.6] text-(--ui-text-primary)">
              Nothing here yet, and nothing Nemesis could honestly draw.
            </p>
            <p className="m-0 mt-[12px] text-[14px] leading-[1.6] text-(--ui-text-secondary)">
              This map fills in as you show what you can do. Start a course and its territory
              appears straight away, unshown, so you can see the shape of it before you know any
              of it.
            </p>
            <a
              className="mt-[20px] inline-flex h-[40px] items-center rounded-[10px] bg-(--ui-action) px-[18px] text-[14px] font-medium text-(--ui-action-glyph)"
              href="/courses"
            >
              Browse courses
            </a>
          </div>
        </div>
      ) : null}

      {/* what a full map has not got yet */}
      {!loading && nodes.length > 0 && !shown ? (
        <div className="absolute left-1/2 top-[calc(var(--titlebar-height)+22px)] w-[520px] -translate-x-1/2 rounded-[12px] bg-(--ui-bg-quaternary) px-[18px] py-[13px] text-center">
          <span className="text-[13px] leading-[1.5] text-(--ui-text-secondary)">
            This is the territory you have taken on. Nothing is filled in yet, because a circle
            only fills when you have shown you can do the thing without help.
          </span>
        </div>
      ) : null}

      {/* the selected node */}
      {selected ? (
        <div className="absolute right-[24px] top-[calc(var(--titlebar-height)+20px)] w-[300px] rounded-[12px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) p-[16px] shadow-[0_12px_32px_rgba(0,0,0,0.06)]">
          <div className="flex items-center gap-[8px]">
            <Mark size={12} state={selected.state} />
            <span className="text-[12px] text-(--ui-text-secondary)">
              {selected.state === "solid"
                ? "Solid"
                : selected.state === "developing"
                  ? "Developing"
                  : selected.state === "unreadable"
                    ? "Nemesis could not read this"
                    : "Not shown yet"}
            </span>
          </div>
          <div className="mt-[7px] text-[16px] font-medium leading-[1.3] text-(--ui-text-primary)">{selected.label}</div>
          {selected.can.length > 0 ? (
            <>
              <div className="mb-[7px] mt-[14px] text-[12px] text-(--ui-text-tertiary)">You can</div>
              {selected.can.map((item) => (
                <div className="text-[13px] leading-[1.45] text-(--ui-text-primary)" key={item}>{item}</div>
              ))}
            </>
          ) : null}
          {selected.needs.length > 0 ? (
            <>
              <div className="mb-[7px] mt-[14px] text-[12px] text-(--ui-text-tertiary)">
                {selected.can.length > 0 ? "Needs work" : "What this asks of you"}
              </div>
              <div className="flex flex-col gap-[6px]">
                {selected.needs.slice(0, 4).map((item) => (
                  <div className="flex gap-[8px] text-[13px] leading-[1.45] text-(--ui-text-primary)" key={item}>
                    <span className="text-(--ui-text-tertiary)">—</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {/* legend */}
      {nodes.length > 0 ? (
        <div className="absolute bottom-[20px] left-[24px] flex items-center gap-[14px] rounded-full border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated)/90 px-[12px] py-[8px] backdrop-blur">
          {(
            [
              ["solid", "Solid"],
              ["developing", "Developing"],
              ["unshown", "Not shown yet"],
              ["unreadable", "Could not read the source"],
            ] as const
          ).map(([state, label]) => (
            <div className="flex items-center gap-[5px] text-[12px] text-(--ui-text-secondary)" key={state}>
              <Mark state={state} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center text-[14px] text-(--ui-text-tertiary)">
          Working out what you know…
        </div>
      ) : null}
    </div>
  );
}

/** Exported for the region strip in a future zoomed-out view; keeps `regionMarks` exercised. */
export { regionMarks };
