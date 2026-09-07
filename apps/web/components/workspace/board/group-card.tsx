"use client";

// The labelled frame on the board, Obsidian's way (owner 2026-09-06: *"can you copy the obsidian
// way to make groups in canvas and color them?"*, *"there should be a way to collapse groups too"*).
//
// 🔴🔴 IT IS NOT A REACT FLOW PARENT NODE, AND THAT IS THE WHOLE DESIGN. React Flow has a built-in
// `parentId` that makes cards children of a box; Obsidian deliberately has nothing of the kind, and
// copying "the obsidian way" means copying that. A group here is a rectangle drawn behind the
// board; what is inside it is answered from the geometry every time it is asked
// (`nodesInsideGroup`), so dragging a card in joins it, dragging it out leaves, and deleting a card
// cannot leave a dangling member behind. See lib/board/board-groups.ts.
//
// 🔴🔴 THE TYPE IS `groupBox`, NEVER `group`. `group` is one of React Flow's four reserved node
// types and its stylesheet styles those by class name; the board already paid for that once, with
// deliverables registered as `output` and drawn inside a second rectangle nobody wrote
// (board-surface.tsx says so at length). `input`, `output`, `default` and `group` are all off
// limits here forever.
//
// 🔴 THE BODY IS TRANSPARENT TO THE POINTER. A frame can be 1,200px wide; if its body took clicks,
// dragging the board anywhere inside it would move the group instead of panning, and half the
// canvas would stop working. The label bar is the handle (React Flow's `dragHandle`), the edges
// resize, and everything in between belongs to the board underneath — which is also why the cards
// standing inside a group behave exactly as they do outside one.

import { NodeResizer, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";

import { GROUP_COLORS, GROUP_COLOR_NAMES, GROUP_HEADER, GROUP_MIN_HEIGHT, GROUP_MIN_WIDTH, UNTITLED_GROUP, nodesInsideGroup, type GroupColor } from "@/lib/board/board-groups";
import { cn } from "@/lib/utils";

import { CardIcon, IconTooltip } from "./board-chrome";
import { useBoard } from "./board-provider";

export type GroupNodeData = { groupId: string; isPickedUp?: boolean };

/** The class React Flow is told to use as this node's drag handle. */
export const GROUP_DRAG_HANDLE = "board-group-handle";

const tintOf = (color: GroupColor | undefined) => (color && color !== "none" ? `var(--board-group-${color})` : "var(--ui-text-tertiary)");

function ColorDot({ color, chosen, onPick }: { color: GroupColor; chosen: boolean; onPick: () => void }) {
  return (
    <IconTooltip label={GROUP_COLOR_NAMES[color]}>
      <button
        aria-label={GROUP_COLOR_NAMES[color]}
        aria-pressed={chosen}
        className={cn(
          "size-[14px] shrink-0 rounded-full border transition-transform hover:scale-110",
          chosen ? "ring-2 ring-foreground ring-offset-1 ring-offset-(--ui-bg-editor)" : "",
          color === "none" ? "border-(--ui-stroke-primary) bg-transparent" : "border-transparent",
        )}
        data-group-color={color}
        onClick={onPick}
        style={color === "none" ? undefined : { backgroundColor: `var(--board-group-${color})` }}
        type="button"
      />
    </IconTooltip>
  );
}

function GroupCardInner({ data, selected }: NodeProps & { data: GroupNodeData }) {
  const { groups, nodeRects, renameGroup, setGroupColor, setGroupCollapsed, deleteGroup } = useBoard();
  const group = groups.find((item) => item.id === data.groupId);
  const input = useRef<HTMLInputElement>(null);
  /**
   * 🔴🔴 THE NAME IS TEXT UNTIL YOU DOUBLE-CLICK IT, AND THAT IS NOT A STYLE CHOICE. An always-live
   * input has to carry React Flow's `nodrag`, and the name field fills the bar — so with an input
   * there, almost the whole label bar refused to drag and the frame could not be moved at all
   * (measured in the harness: a drag from the bar moved nothing). Obsidian has the same two states
   * for the same reason: single click chooses the group, double click renames it.
   *
   * 🔴 A NEW FRAME STARTS IN THE SECOND STATE, because a group you have just drawn is asking for a
   * name — which is exactly what Obsidian does when `createGroupNode` focuses the label.
   */
  const [naming, setNaming] = useState(() => group?.label === UNTITLED_GROUP);
  useEffect(() => {
    if (naming) input.current?.select();
  }, [naming]);
  if (!group) return null;
  const tint = tintOf(group.color);
  const collapsed = group.collapsed === true;
  /**
   * 🔴 THE FRAME KEEPS ITS FULL RECTANGLE WHILE IT IS FOLDED. Only the NODE is drawn at bar height
   * (board-surface.tsx); `group.height` is untouched, so "what is inside" is still the same
   * question with the same answer, and expanding is nothing more than drawing it tall again. Had
   * the stored rectangle shrunk, a folded group would have contained nothing and would have come
   * back empty.
   */
  const inside = collapsed ? nodesInsideGroup(group, nodeRects()).length : 0;
  return (
    <div
      className={cn(
        "group/frame relative flex h-full w-full flex-col rounded-[14px] border-2 transition-shadow",
        selected && "shadow-[0_0_0_2px_var(--ui-bg-editor)]",
      )}
      style={{
        borderColor: group.color ? `color-mix(in srgb, ${tint} 60%, transparent)` : "var(--ui-stroke-secondary)",
        // 🔴 A WASH, NOT A FILL. The cards standing inside keep their own ground; a group that
        // painted an opaque rectangle would change what every card on it looks like.
        backgroundColor: group.color ? `color-mix(in srgb, ${tint} 7%, transparent)` : "color-mix(in srgb, var(--ui-base) 3%, transparent)",
      }}
    >
      <NodeResizer
        color="var(--ui-action)"
        isVisible={selected === true}
        minHeight={collapsed ? GROUP_HEADER : GROUP_MIN_HEIGHT}
        minWidth={GROUP_MIN_WIDTH}
      />
      {/* The label bar: the only part of the frame that takes a press, and the drag handle. */}
      <header
        className={cn(GROUP_DRAG_HANDLE, "pointer-events-auto flex shrink-0 cursor-grab items-center gap-[6px] rounded-t-[12px] px-[10px] active:cursor-grabbing")}
        style={{ height: GROUP_HEADER }}
      >
        <button
          aria-label={collapsed ? `Expand ${group.label}` : `Collapse ${group.label}`}
          className="nodrag flex size-[20px] shrink-0 items-center justify-center rounded-[4px] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
          data-group-collapse={collapsed ? "collapsed" : "open"}
          onClick={() => setGroupCollapsed(group.id, !collapsed)}
          type="button"
        >
          {collapsed ? <ChevronRight aria-hidden className="size-[14px]" /> : <ChevronDown aria-hidden className="size-[14px]" />}
        </button>
        {naming ? (
          <input
            aria-label="Group name"
            className="nodrag nopan min-w-0 flex-1 truncate bg-transparent text-[13px] font-medium leading-[18px] outline-none placeholder:text-(--ui-text-quaternary)"
            data-group-label=""
            onBlur={() => setNaming(false)}
            onChange={(event) => renameGroup(group.id, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
            }}
            placeholder={UNTITLED_GROUP}
            ref={input}
            style={{ color: group.color ? tint : "var(--ui-text-secondary)" }}
            value={group.label}
          />
        ) : (
          /* 🔴 ONE CLICK RENAMES A FRAME YOU HAVE ALREADY CHOSEN, which is the Finder rule and the
             one people find without being told. Owner, 2026-09-06: *"users should be able to name
             the group"* — they could, by double-clicking, and nothing on screen said so. The first
             click still only selects (or the bar could not be dragged), and a double-click works
             from either state. */
          <span
            className="min-w-0 flex-1 cursor-text truncate text-[13px] font-medium leading-[18px]"
            data-group-name=""
            onClick={() => {
              if (selected) setNaming(true);
            }}
            onDoubleClick={() => setNaming(true)}
            style={{ color: group.color ? tint : "var(--ui-text-secondary)" }}
            title="Click to rename"
          >
            {group.label || UNTITLED_GROUP}
          </span>
        )}
        {collapsed && <span className="shrink-0 text-[12px] leading-[16px] text-(--ui-text-quaternary)">{inside === 1 ? "1 card" : `${inside} cards`}</span>}
        {/* 🔴 THE SIX COLOURS INLINE, NOT BEHIND A MENU (owner 2026-09-04: "i dont want any popups in
            canvas"). They appear when the frame is chosen and are gone the rest of the time, so a
            board of groups is not a board of palettes. */}
        {/* 🔴 THE COLOURS DO NOT HIDE WHILE THE NAME IS BEING TYPED, and hiding them was a real dead
            end: clicking the bar to choose the frame focuses its name, so the one press that gets
            you to the colours was the press that took them away. The name field truncates; there is
            always room. */}
        <span
          className={cn(
            "nodrag flex shrink-0 items-center gap-[4px] pl-[4px] transition-opacity",
            // 🔴 HIDDEN MEANS UNCLICKABLE, NOT JUST INVISIBLE. `opacity-0` on its own leaves a live
            // control under the pointer: measured in the harness, a click on what looked like empty
            // bar deleted the frame, because the delete icon below was still taking presses.
            selected ? "opacity-100" : "pointer-events-none opacity-0 group-hover/frame:pointer-events-auto group-hover/frame:opacity-100",
          )}
          data-group-colors=""
        >
          {GROUP_COLORS.map((color) => (
            <ColorDot chosen={(group.color ?? "none") === color} color={color} key={color} onPick={() => setGroupColor(group.id, color)} />
          ))}
        </span>
        <span
          className={cn(
            "nodrag shrink-0 transition-opacity",
            selected ? "opacity-100" : "pointer-events-none opacity-0 group-hover/frame:pointer-events-auto group-hover/frame:opacity-100",
          )}
        >
          <CardIcon label="Delete group" onClick={() => deleteGroup(group.id)} tone="danger">
            <Trash2 className="size-[14px]" />
          </CardIcon>
        </span>
      </header>
      {/* Everything below the bar belongs to the board: the cards draw over it, and a drag here pans. */}
      <div className="pointer-events-none min-h-0 flex-1" />
    </div>
  );
}

export const GroupCard = memo(GroupCardInner);
