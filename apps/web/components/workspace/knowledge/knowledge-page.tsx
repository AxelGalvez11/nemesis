"use client";

// Knowledge — the learner's map of what they can do, as a graph you can move around in.
//
// 🔴 THE SHAPE IS THE OWNER'S PICK. Four directions were drawn (spatial graph, territory, orbit,
// list) and he chose the spatial graph, 2026-09-03: *"i like the spatial graph."* Then, 2026-09-04:
// *"make the knowledge page actually navigatable, and have the nodes be similar to an obsidian
// graph."* So: drag to pan, scroll to zoom, nodes sized by how connected they are, labels that
// appear as you zoom in, and hovering one dims everything it is not touching.
//
// 🔴 THREE STATES, NOT FOUR. The "could not read the source" mark is gone by owner ruling
// (2026-09-04) and its absence is consistent rather than a loss: once uploads stopped creating
// nodes, a parse failure had nothing to attach to. See `lib/knowledge/graph.ts`.
//
// 🔴 NO NUMBERS ANYWHERE ON THIS SURFACE — `docs/minimap-knowledge-territory.md`, owner-authored:
// "No XP, no streaks, no hearts, no large percentages."

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buildKnowledgeNodes } from "@/lib/knowledge/build";
import {
  boundsOf,
  hasDemonstrations,
  layout,
  neighboursOf,
  type KnowledgeNode,
  type NodeState,
} from "@/lib/knowledge/graph";

/** Below this scale a label would be unreadable, so it is not drawn. Obsidian does the same. */
const LABEL_FROM = 0.62;
const MIN_SCALE = 0.25;
const MAX_SCALE = 3.2;

interface View {
  x: number;
  y: number;
  k: number;
}

function Mark({ state, size = 11 }: { state: NodeState; size?: number }) {
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

const STATE_WORDS: Record<NodeState, string> = {
  solid: "Solid",
  developing: "Developing",
  unshown: "Not shown yet",
};

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
   * populated map — and a map with nothing on it cannot show whether the map works.
   */
  nodes?: readonly KnowledgeNode[] | null;
}) {
  const [nodes, setNodes] = useState<KnowledgeNode[]>(given ? [...given] : []);
  const [loading, setLoading] = useState(given === null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const frame = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ px: number; py: number; vx: number; vy: number; moved: boolean } | null>(null);

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

  const map = useMemo(() => layout(nodes), [nodes]);

  /**
   * Fit the whole map on first paint.
   *
   * 🔴 MEASURED FROM THE ELEMENT, NOT ASSUMED. The pane this renders in is not a fixed size — it
   * changes with the sidebar and the window — so a hard-coded starting scale would land differently
   * on every machine. Runs once per node set, never on every render, or panning would snap back.
   */
  useEffect(() => {
    const box = frame.current?.getBoundingClientRect();
    if (!box || map.nodes.length === 0) return;
    const b = boundsOf(map.nodes);
    const pad = 120;
    const k = Math.max(
      MIN_SCALE,
      Math.min(1.15, Math.min((box.width - pad) / b.w, (box.height - pad) / b.h)),
    );
    setView({
      k,
      x: box.width / 2 - (b.x + b.w / 2) * k,
      y: box.height / 2 - (b.y + b.h / 2) * k,
    });
  }, [map]);

  const onWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault();
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    const mx = event.clientX - box.left;
    const my = event.clientY - box.top;
    setView((prev) => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.k * Math.exp(-event.deltaY * 0.0016)));
      // Keep whatever is under the pointer under the pointer.
      return { k: next, x: mx - ((mx - prev.x) / prev.k) * next, y: my - ((my - prev.y) / prev.k) * next };
    });
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { px: event.clientX, py: event.clientY, vx: view.x, vy: view.y, moved: false };
  }, [view.x, view.y]);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.px;
    const dy = event.clientY - d.py;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    setView((prev) => ({ ...prev, x: d.vx + dx, y: d.vy + dy }));
  }, []);

  const onPointerUp = useCallback(() => {
    // 🔴 A DRAG THAT ENDED ON A NODE IS NOT A CLICK ON IT. Without this, panning across the map
    // selects whatever happened to be under the finger when it lifted.
    const moved = drag.current?.moved ?? false;
    drag.current = null;
    return moved;
  }, []);

  const lit = useMemo(() => neighboursOf(map.edges, hoverId), [map.edges, hoverId]);
  const dimming = hoverId !== null;
  const selected = useMemo(() => map.nodes.find((n) => n.id === selectedId) ?? null, [map.nodes, selectedId]);
  const shown = hasDemonstrations(nodes);

  return (
    <div className="relative h-full min-w-0 overflow-hidden bg-(--ui-bg-editor) pt-(--titlebar-height)">
      <div
        className="absolute inset-0 touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        ref={frame}
        style={{ cursor: drag.current ? "grabbing" : "grab" }}
      >
        <svg className="block h-full w-full">
          <defs>
            <pattern height="26" id="knowledge-dots" patternUnits="userSpaceOnUse" width="26">
              <circle cx="1.2" cy="1.2" fill="var(--ui-stroke-tertiary)" r="1.2" />
            </pattern>
          </defs>
          <rect fill="url(#knowledge-dots)" height="100%" width="100%" />

          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {map.edges.map((edge, i) => {
              const a = map.nodes.find((n) => n.id === edge.a);
              const b = map.nodes.find((n) => n.id === edge.b);
              if (!a || !b) return null;
              const on = !dimming || (lit.has(a.id) && lit.has(b.id));
              return (
                <line
                  key={`${edge.a}-${edge.b}-${i}`}
                  opacity={on ? 1 : 0.12}
                  stroke="var(--ui-stroke-secondary)"
                  strokeWidth={1.1 / view.k}
                  x1={a.x}
                  x2={b.x}
                  y1={a.y}
                  y2={b.y}
                />
              );
            })}

            {map.nodes.map((node) => {
              const on = !dimming || lit.has(node.id);
              const isSelected = node.id === selectedId;
              return (
                <g
                  key={node.id}
                  onClick={() => {
                    if (drag.current?.moved) return;
                    setSelectedId((prev) => (prev === node.id ? null : node.id));
                  }}
                  onPointerEnter={() => setHoverId(node.id)}
                  onPointerLeave={() => setHoverId((prev) => (prev === node.id ? null : prev))}
                  opacity={on ? 1 : 0.16}
                  style={{ cursor: "pointer" }}
                >
                  {isSelected ? (
                    <circle cx={node.x} cy={node.y} fill="none" r={node.r + 7} stroke="var(--ui-text-primary)" strokeWidth={1.6 / view.k} />
                  ) : null}
                  {node.state === "solid" ? (
                    <circle cx={node.x} cy={node.y} fill="var(--ui-text-primary)" r={node.r} />
                  ) : node.state === "developing" ? (
                    <>
                      <circle cx={node.x} cy={node.y} fill="var(--ui-bg-editor)" r={node.r} stroke="var(--ui-text-primary)" strokeWidth={1.8} />
                      <path d={`M${node.x} ${node.y - node.r}A${node.r} ${node.r} 0 0 1 ${node.x} ${node.y + node.r}Z`} fill="var(--ui-text-primary)" />
                    </>
                  ) : (
                    <circle cx={node.x} cy={node.y} fill="var(--ui-bg-editor)" r={node.r} stroke="var(--ui-text-tertiary)" strokeWidth={1.6} />
                  )}
                  {view.k >= LABEL_FROM || isSelected || hoverId === node.id ? (
                    <text
                      fill="var(--ui-text-secondary)"
                      fontSize={11 / Math.max(view.k, 0.7)}
                      textAnchor="middle"
                      x={node.x}
                      y={node.y + node.r + 13 / Math.max(view.k, 0.7)}
                    >
                      {node.label.length > 34 ? `${node.label.slice(0, 32)}…` : node.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* floating title, the app's own pattern */}
      <div className="pointer-events-none absolute left-[24px] top-[calc(var(--titlebar-height)+20px)]">
        <h1 className="m-0 text-[28px] font-medium leading-[34px] tracking-[-0.01em] text-(--ui-text-primary)">
          Knowledge
        </h1>
      </div>

      {!loading && nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="max-w-[520px] px-[24px] text-center">
            <p className="m-0 text-[16px] leading-[1.6] text-(--ui-text-primary)">
              Nothing here yet, and nothing Nemesis could honestly draw.
            </p>
            <p className="m-0 mt-[12px] text-[14px] leading-[1.6] text-(--ui-text-secondary)">
              This map fills in as you show what you can do. Start a course and its territory appears
              straight away, unshown, so you can see the shape of it before you know any of it.
            </p>
            <a
              className="pointer-events-auto mt-[20px] inline-flex h-[40px] items-center rounded-[10px] bg-(--ui-action) px-[18px] text-[14px] font-medium text-(--ui-action-glyph)"
              href="/courses"
            >
              Browse courses
            </a>
          </div>
        </div>
      ) : null}

      {!loading && nodes.length > 0 && !shown ? (
        <div className="pointer-events-none absolute left-1/2 top-[calc(var(--titlebar-height)+22px)] w-[520px] -translate-x-1/2 rounded-[12px] bg-(--ui-bg-quaternary) px-[18px] py-[13px] text-center">
          <span className="text-[13px] leading-[1.5] text-(--ui-text-secondary)">
            This is the territory you have taken on. Nothing is filled in yet, because a circle only
            fills when you have shown you can do the thing without help.
          </span>
        </div>
      ) : null}

      {selected ? (
        <div className="absolute right-[24px] top-[calc(var(--titlebar-height)+20px)] w-[300px] rounded-[12px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) p-[16px] shadow-[0_12px_32px_rgba(0,0,0,0.06)]">
          <div className="flex items-center gap-[8px]">
            <Mark size={12} state={selected.state} />
            <span className="text-[12px] text-(--ui-text-secondary)">{STATE_WORDS[selected.state]}</span>
          </div>
          <div className="mt-[7px] text-[16px] font-medium leading-[1.3] text-(--ui-text-primary)">{selected.label}</div>
          <div className="mt-[3px] text-[12px] text-(--ui-text-tertiary)">{selected.region}</div>
          {selected.can.length > 0 ? (
            <>
              <div className="mb-[7px] mt-[14px] text-[12px] text-(--ui-text-tertiary)">You can</div>
              <div className="flex flex-col gap-[6px]">
                {selected.can.map((item) => (
                  <div className="flex gap-[8px] text-[13px] leading-[1.45] text-(--ui-text-primary)" key={item}>
                    <span className="text-(--ui-text-tertiary)">—</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
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

      {nodes.length > 0 ? (
        <>
          <div className="pointer-events-none absolute bottom-[20px] left-[24px] flex items-center gap-[14px] rounded-full border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated)/90 px-[12px] py-[8px] backdrop-blur">
            {(["solid", "developing", "unshown"] as const).map((state) => (
              <div className="flex items-center gap-[5px] text-[12px] text-(--ui-text-secondary)" key={state}>
                <Mark state={state} />
                <span>{STATE_WORDS[state]}</span>
              </div>
            ))}
          </div>

          <div className="absolute bottom-[20px] right-[24px] flex flex-col overflow-hidden rounded-[10px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated)">
            <button
              className="flex h-[36px] w-[36px] items-center justify-center border-b border-(--ui-stroke-tertiary) text-(--ui-text-secondary)"
              onClick={() => setView((v) => ({ ...v, k: Math.min(MAX_SCALE, v.k * 1.25) }))}
              type="button"
            >
              <svg fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" viewBox="0 0 16 16" width="16">
                <path d="M8 3.5v9M3.5 8h9" />
              </svg>
            </button>
            <button
              className="flex h-[36px] w-[36px] items-center justify-center text-(--ui-text-secondary)"
              onClick={() => setView((v) => ({ ...v, k: Math.max(MIN_SCALE, v.k / 1.25) }))}
              type="button"
            >
              <svg fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" viewBox="0 0 16 16" width="16">
                <path d="M3.5 8h9" />
              </svg>
            </button>
          </div>
        </>
      ) : null}

      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center text-[14px] text-(--ui-text-tertiary)">
          Working out what you know…
        </div>
      ) : null}
    </div>
  );
}
