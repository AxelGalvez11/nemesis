// Where things go, worked out away from the drawing (§44).
//
// 🔴 THIS FILE EXISTS BECAUSE THREE LAYOUT DEFECTS SHIPPED THAT EVERY TEST PASSED. The relationship
// diagram stacked every node in one column, so a side branch read as a step in the chain; two
// timeline labels four years apart printed on top of each other; and the angle mark sat on the point
// label at the same vertex. Each one was arithmetically correct and visually wrong, and none of them
// was catchable while the arithmetic lived inside a React component that only a browser could run.
//
// 🔴 SO POSITION IS COMPUTED HERE AND ONLY DRAWN THERE. Everything below is a pure function from a
// verified visual to coordinates. That makes the questions a reader actually has — *do two labels
// overlap? does this edge cross a box? is the angle mark inside the angle?* — assertions in a test
// file rather than something somebody has to notice by eye in a screenshot.
//
// 🔴 NOTHING HERE MEASURES TEXT, AND NOTHING HERE MAY. These run on the server while a lesson is
// built, where there is no font metrics engine, and they must give the same answer as the browser or
// the picture moves after it renders. Width is ESTIMATED from character count, deliberately on the
// generous side: over-estimating spreads labels slightly further apart than they need to be, and
// under-estimating puts them back on top of each other.

import type {
  CircuitComponent,
  CircuitGroup,
  CircuitPart,
  CircuitVisual,
  ConstructionVisual,
  FlowVisual,
  TimelineVisual,
} from "./canvas-visual";

/** Every visual is drawn into the same box, so they line up down the Canvas. */
export const VISUAL_WIDTH = 640;

/**
 * ...and into the same height, which until now it was not.
 *
 * 🔴 REPORTED 2026-08-20: *"are the plot size standardized?"* The width was — this constant, used
 * by all nine kinds. The height was not, and nobody had ever looked: four figures that each choose
 * their own canvas had independently picked **240** (a molecule), **280** (a plot), **320** (a
 * geometric construction) and **340** (a force diagram). Scrolling past them, the column visibly
 * breathes in and out, which is the opposite of what a shared width is for.
 *
 * 280 is the survivor because the plot is the most-tuned of the four and the most frequently drawn.
 *
 * 🔴 THE OTHER TWO SHAPES GROW, AND CAPPING THEM WOULD BE WORSE THAN LEAVING THEM ALONE. A flow
 * diagram's height is a function of how many rows it has and a timeline's of how many events; an
 * SVG whose viewBox is taller than its painted box does not crop, it scales the WHOLE drawing down
 * uniformly — so a ceiling on a twelve-event timeline would shrink it to half-width with 5px
 * labels. They get the same number as a FLOOR instead, so a two-node diagram is not a sliver
 * sitting next to a full-height plot, and they grow past it honestly when they have to.
 */
export const VISUAL_HEIGHT = 280;

/**
 * The one class every drawn figure wears.
 *
 * 🔴 THE FLOOR IS CSS AND THE VIEWBOX IS LEFT TRUTHFUL, WHICH IS THE WHOLE TRICK. Padding a short
 * diagram's viewBox up to 280 would anchor its drawing at the top with dead space beneath it, and
 * re-centring it would mean shifting every coordinate in the layout. An SVG box taller than its
 * viewBox instead centres the drawing for free — `preserveAspectRatio` defaults to `xMidYMid meet`
 * — so the geometry below never learns that a floor exists.
 *
 * 🔴 THE PX IS A LITERAL BECAUSE TAILWIND READS SOURCE TEXT, NOT VALUES. `min-h-[280px]` cannot
 * interpolate `VISUAL_HEIGHT`, so `visual-layout.test.ts` pins the two together instead — change
 * the constant without this string and the suite reddens.
 */
export const VISUAL_FIGURE_CLASS = "h-auto w-full min-h-[280px]";

export type TextAnchor = "start" | "middle" | "end";

/**
 * A width for a string nobody has rendered yet.
 *
 * 🔴 0.55 EM PER CHARACTER IS A DELIBERATE OVER-ESTIMATE. The real average for mixed-case text in a
 * humanist sans is nearer 0.5; the extra buys margin for capitals, wide digits and the fonts a
 * learner's browser might substitute. The failure this guards is two labels judged not to overlap
 * and then overlapping.
 */
const GLYPH_WIDTH = 0.55;

export function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * GLYPH_WIDTH;
}

/** Cut a string to what fits, keeping an ellipsis so the reader knows something was cut. */
export function truncateToWidth(text: string, fontSize: number, maxWidth: number): string {
  const perCharacter = fontSize * GLYPH_WIDTH;
  const fits = Math.floor(maxWidth / perCharacter);
  if (fits >= text.length) return text;
  if (fits < 2) return "…";
  return `${text.slice(0, fits - 1).trimEnd()}…`;
}

// ─────────────────────────────────────────────────────────────────────── relationship

const FLOW_NODE_HEIGHT = 46;
const FLOW_ROW_HEIGHT = 82;
const FLOW_TOP = 45;
const FLOW_MAX_NODE_WIDTH = 360;
const FLOW_NODE_GAP = 18;
const FLOW_EDGE_GAP = 26;
const FLOW_PORT_GAP = 28;
const FLOW_LABEL_FONT = 14;

export interface FlowBox {
  readonly id: string;
  readonly label: string;
  readonly cx: number;
  readonly cy: number;
  readonly width: number;
  readonly height: number;
  readonly rank: number;
}

export interface FlowEdgeLine {
  readonly path: string;
  readonly polarity: "increases" | "decreases" | "plain";
  readonly label?: string;
  readonly labelX: number;
  readonly labelY: number;
  readonly labelAnchor: TextAnchor;
}

export interface FlowPlacement {
  readonly height: number;
  readonly boxes: readonly FlowBox[];
  readonly edges: readonly FlowEdgeLine[];
}

/**
 * Which row each node belongs on.
 *
 * 🔴 RANKED FROM THE END, NOT FROM THE START, AND THAT IS THE FIX FOR THE SIDE BRANCH. Ranking by
 * distance from a source puts an inhibitor on row 0 beside the ligand it has nothing to do with,
 * three rows above the thing it acts on — so its edge runs the length of the diagram and straight
 * through whatever box sits between. Ranking by distance to a SINK puts every node one row above the
 * thing it feeds, so the inhibitor lands beside the receptor, level with the step it competes with,
 * and its arrow is one short diagonal into the shared target. That is what "branches in from the
 * side" means geometrically.
 *
 * 🔴 THE PASS LIMIT IS THE CYCLE GUARD. A → B → A has no longest path, so relaxation would never
 * settle. Stopping after one pass per node bounds the work and still produces a usable, deterministic
 * layering for the cyclic case — a drawn diagram rather than a hung tab.
 */
function ranksFor(visual: FlowVisual): Map<string, number> {
  const ids = new Set(visual.nodes.map((node) => node.id));
  const links = visual.edges.filter((edge) => edge.from !== edge.to && ids.has(edge.from) && ids.has(edge.to));
  const toSink = new Map(visual.nodes.map((node) => [node.id, 0]));
  for (let pass = 0; pass < visual.nodes.length; pass += 1) {
    let changed = false;
    for (const edge of links) {
      const candidate = toSink.get(edge.to)! + 1;
      if (toSink.get(edge.from)! < candidate) {
        toSink.set(edge.from, candidate);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const deepest = Math.max(0, ...toSink.values());
  return new Map(visual.nodes.map((node) => [node.id, deepest - toSink.get(node.id)!]));
}

export function layoutFlow(visual: FlowVisual): FlowPlacement {
  const ranks = ranksFor(visual);
  const rowCount = Math.max(...ranks.values()) + 1;
  const rows: string[][] = Array.from({ length: rowCount }, () => []);
  // Declaration order inside a row, so the same request always draws the same picture and an author
  // who wants a different left-to-right order can get one by reordering their nodes.
  for (const node of visual.nodes) rows[ranks.get(node.id) ?? 0]?.push(node.id);

  const boxes: FlowBox[] = [];
  for (const [rank, row] of rows.entries()) {
    const width = Math.min(FLOW_MAX_NODE_WIDTH, (VISUAL_WIDTH - FLOW_NODE_GAP * (row.length + 1)) / row.length);
    const span = row.length * width + FLOW_NODE_GAP * (row.length - 1);
    const start = (VISUAL_WIDTH - span) / 2;
    for (const [column, id] of row.entries()) {
      const label = visual.nodes.find((node) => node.id === id)!.label;
      boxes.push({
        cx: start + column * (width + FLOW_NODE_GAP) + width / 2,
        cy: FLOW_TOP + rank * FLOW_ROW_HEIGHT,
        height: FLOW_NODE_HEIGHT,
        id,
        label: truncateToWidth(label, FLOW_LABEL_FONT, width - 20),
        rank,
        width,
      });
    }
  }
  const at = new Map(boxes.map((box) => [box.id, box]));

  // 🔴 TWO EDGES INTO ONE NODE GET TWO DOORWAYS, WHICH IS A SECOND DEFECT THE FIRST FIX EXPOSED. Once
  // the inhibitor moved beside the receptor, both of their arrows arrived at the exact centre of the
  // top of the shared target — so the blunt bar that means "blocks this" was drawn underneath the
  // arrowhead that means "drives this", and the one distinction the diagram exists to make was
  // invisible. Arrivals are spread across the edge of the box they arrive at, ordered by where they
  // come from so the lines do not cross on the way.
  const ports = portsFor(visual.edges, at);

  const edges = visual.edges.map((edge, index) => {
    const from = at.get(edge.from);
    const to = at.get(edge.to);
    const polarity = edge.polarity ?? "plain";
    if (!from || !to) return { labelAnchor: "start" as const, labelX: 0, labelY: 0, path: "", polarity };
    return {
      ...routeEdge(from, to, boxes, ports.get(index)),
      ...(edge.label ? { label: edge.label } : {}),
      polarity,
    };
  });

  return {
    boxes,
    edges: edges.filter((edge) => edge.path !== ""),
    height: FLOW_TOP + (rowCount - 1) * FLOW_ROW_HEIGHT + FLOW_NODE_HEIGHT / 2 + 22,
  };
}

/**
 * One edge, as a path plus somewhere to put its label.
 *
 * 🔴 AN EDGE THAT SKIPS A ROW IS BOWED OUT OF THE COLUMN, BECAUSE A STRAIGHT ONE GOES THROUGH A BOX.
 * Ranking from the end makes skipping rare but not impossible — a node feeding both the next step and
 * the last one still spans two rows — and a line crossing a labelled box is unreadable in a way that
 * looks like a rendering bug rather than a diagram. The curve is pushed past the widest box in every
 * row it passes, on whichever side has more room.
 */
interface EdgePort {
  readonly startX: number;
  readonly endX: number;
}

/** Where every edge leaves and arrives, spread along the box edge rather than piled at its middle. */
function portsFor(edges: FlowVisual["edges"], at: Map<string, FlowBox>): Map<number, EdgePort> {
  const buckets = new Map<string, { index: number; end: "start" | "end"; toward: number }[]>();
  const add = (key: string, entry: { index: number; end: "start" | "end"; toward: number }) => {
    const list = buckets.get(key) ?? [];
    list.push(entry);
    buckets.set(key, list);
  };
  edges.forEach((edge, index) => {
    const from = at.get(edge.from);
    const to = at.get(edge.to);
    if (!from || !to || from.id === to.id || from.rank === to.rank) return;
    const downward = to.rank > from.rank;
    add(`${from.id}:${downward ? "bottom" : "top"}`, { end: "start", index, toward: to.cx });
    add(`${to.id}:${downward ? "top" : "bottom"}`, { end: "end", index, toward: from.cx });
  });

  const ports = new Map<number, EdgePort>();
  for (const [key, list] of buckets) {
    const box = at.get(key.slice(0, key.lastIndexOf(":")))!;
    // Ordered by where the other end is, so two edges sharing a box do not swap sides and cross.
    list.sort((a, b) => a.toward - b.toward || a.index - b.index);
    const gap = list.length < 2 ? 0 : Math.min(FLOW_PORT_GAP, (box.width * 0.6) / (list.length - 1));
    list.forEach((entry, position) => {
      const x = box.cx + (position - (list.length - 1) / 2) * gap;
      const held = ports.get(entry.index) ?? { endX: Number.NaN, startX: Number.NaN };
      ports.set(entry.index, entry.end === "start" ? { ...held, startX: x } : { ...held, endX: x });
    });
  }
  return ports;
}

function routeEdge(
  from: FlowBox,
  to: FlowBox,
  boxes: readonly FlowBox[],
  port: EdgePort | undefined,
): Omit<FlowEdgeLine, "polarity" | "label"> {
  if (from.id === to.id) {
    // A node acting on itself. A line to the same place has no direction and no length, so it is
    // drawn as a loop off the right-hand side instead.
    const x = from.cx + from.width / 2;
    const y = from.cy;
    return {
      labelAnchor: "start",
      labelX: x + 30,
      labelY: y - 20,
      path: `M ${x} ${y - 10} C ${x + 44} ${y - 30}, ${x + 44} ${y + 30}, ${x} ${y + 10}`,
    };
  }

  const gap = from.rank === to.rank ? 0 : Math.sign(to.rank - from.rank);
  if (gap === 0) {
    // Same row: connect the facing sides.
    const rightwards = to.cx > from.cx;
    const x1 = from.cx + (rightwards ? from.width / 2 : -from.width / 2);
    const x2 = to.cx + (rightwards ? -to.width / 2 : to.width / 2);
    return {
      labelAnchor: "middle",
      labelX: (x1 + x2) / 2,
      labelY: from.cy - 10,
      path: `M ${x1} ${from.cy} L ${x2} ${to.cy}`,
    };
  }

  const x1 = Number.isFinite(port?.startX) ? port!.startX : from.cx;
  const x2 = Number.isFinite(port?.endX) ? port!.endX : to.cx;
  const y1 = from.cy + (gap > 0 ? from.height / 2 : -from.height / 2);
  const y2 = to.cy - (gap > 0 ? to.height / 2 : -to.height / 2);
  const spanned = Math.abs(to.rank - from.rank);

  if (spanned === 1) {
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    // Perpendicular to the direction of travel, so a label sits beside its line rather than on it.
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy) || 1;
    const offsetX = (dy / length) * 10;
    return {
      labelAnchor: offsetX >= 0 ? "start" : "end",
      labelX: midX + offsetX,
      labelY: midY - (dx / length) * 10 + 4,
      path: `M ${x1} ${y1} L ${x2} ${y2}`,
    };
  }

  const low = Math.min(from.rank, to.rank);
  const high = Math.max(from.rank, to.rank);
  const crossed = boxes.filter((box) => box.rank > low && box.rank < high);
  const leftMost = Math.min(...crossed.map((box) => box.cx - box.width / 2), x1, x2);
  const rightMost = Math.max(...crossed.map((box) => box.cx + box.width / 2), x1, x2);
  const goLeft = (x1 + x2) / 2 <= VISUAL_WIDTH / 2;
  const controlX = goLeft
    ? Math.max(6, leftMost - FLOW_EDGE_GAP)
    : Math.min(VISUAL_WIDTH - 6, rightMost + FLOW_EDGE_GAP);
  return {
    labelAnchor: goLeft ? "end" : "start",
    labelX: controlX + (goLeft ? -6 : 6),
    labelY: (y1 + y2) / 2,
    path: `M ${x1} ${y1} C ${controlX} ${y1}, ${controlX} ${y2}, ${x2} ${y2}`,
  };
}

// ─────────────────────────────────────────────────────────────────────── timeline

const TIMELINE_EDGE = 12;
const TIMELINE_TIER_HEIGHT = 28;
const TIMELINE_BELOW_AXIS = 20;
const TIMELINE_TOP = 8;
const TIMELINE_LABEL_FONT = 12;
const TIMELINE_DATE_FONT = 10;
const TIMELINE_GUTTER = 10;
/** What a covered event shows instead of its label. */
export const COVERED = "?";

export interface TimelineMark {
  readonly index: number;
  /** Where the event sits on the scale. */
  readonly x: number;
  /** The right-hand end of a span, or the same as `x` for a moment. */
  readonly endX: number;
  readonly axisY: number;
  readonly isSpan: boolean;
  readonly uncertain: boolean;
  readonly covered: boolean;
  readonly label: string;
  readonly date: string;
  readonly textX: number;
  readonly labelY: number;
  readonly dateY: number;
  readonly anchor: TextAnchor;
  /** How many tiers above the axis this label was lifted to clear its neighbours. */
  readonly tier: number;
  /** Where the occupied strip starts and ends, so a test can prove two labels do not touch. */
  readonly extent: { readonly from: number; readonly to: number };
}

export interface TimelineLane {
  readonly name: string;
  readonly axisY: number;
}

export interface TimelinePlacement {
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly lanes: readonly TimelineLane[];
  readonly marks: readonly TimelineMark[];
}

/**
 * Events on a scale, with every label somewhere it can be read.
 *
 * 🔴 LABELS ARE LIFTED, NOT SHRUNK OR DROPPED, AND THE ALTERNATIVES WERE BOTH WORSE. Two events four
 * years apart on a three-century scale are four pixels apart, and no font size makes "31 BCE
 * (uncertain)" and "27 BCE" fit side by side there. Rotating them makes a timeline nobody reads;
 * hiding one loses the event; so the second label moves up a tier and a leader line ties it back to
 * its marker. The picture grows taller, which is the cost, and every event stays legible, which is
 * the point.
 *
 * 🔴 BOTH LINES OF TEXT MOVED ABOVE THE AXIS. They used to straddle it — name above, date below —
 * which meant a tier could not be a single block and the space under the axis was spent on text
 * instead of on the spans and lane names that belong there.
 */
export function layoutTimeline(visual: TimelineVisual): TimelinePlacement {
  const positions = visual.events.flatMap((event) => [event.at, event.until ?? event.at]);
  const min = Math.min(...positions);
  const max = Math.max(...positions);
  const span = max - min || 1;
  const usable = VISUAL_WIDTH - TIMELINE_EDGE * 2;
  const scale = (value: number) => TIMELINE_EDGE + ((value - min) / span) * usable;

  const laneNames = [...new Set(visual.events.map((event) => event.lane ?? ""))];
  const marks: TimelineMark[] = [];
  const lanes: TimelineLane[] = [];
  let cursor = TIMELINE_TOP;

  for (const name of laneNames) {
    // 🔴 RIGHT TO LEFT, AND THAT ORDER IS THE WHOLE CORRECTNESS ARGUMENT. A label extends rightwards
    // from its marker, and a lifted label needs a leader line running down THROUGH the tiers below
    // it — so the thing a label can collide with is the leader of an event to its RIGHT. Placing
    // left to right meant deciding where a label goes before knowing whether a leader was about to
    // be drawn across it, which is exactly what happened: "31 BCE (uncertain)" was placed cleanly and
    // then had a leader drawn straight through it. Going right to left, everything a label could
    // strike is already on the page.
    const inLane = visual.events
      .map((event, index) => ({ event, index }))
      .filter((entry) => (entry.event.lane ?? "") === name)
      .sort((a, b) => scale(b.event.at) - scale(a.event.at) || b.index - a.index);

    // 🔴 TIERS ARE ASSIGNED BEFORE THE AXIS HAS A Y, because how tall the lane is depends on how many
    // tiers it needed. Working the other way round is what leaves a picture with text outside it.
    const onTier: { from: number; to: number }[][] = [];
    const leaders: { x: number; tier: number }[] = [];
    const placed = inLane.map((entry) => {
      const covered = visual.hidden === entry.index;
      const label = covered ? COVERED : entry.event.label;
      const date = covered
        ? ""
        : `${entry.event.atLabel ?? entry.event.at}${entry.event.uncertain ? " (uncertain)" : ""}`;
      const markerX = scale(entry.event.at);
      const width = Math.max(textWidth(label, TIMELINE_LABEL_FONT), textWidth(date, TIMELINE_DATE_FONT));
      const room = usable - 8;
      const fitted = Math.min(width, room);

      // Right of the marker by default; flipped to the left when that would run off the edge, and
      // clamped inside the frame if neither side fits.
      let anchor: TextAnchor = "start";
      let from = markerX + 8;
      if (from + fitted > VISUAL_WIDTH - 4) {
        anchor = "end";
        from = markerX - 8 - fitted;
      }
      if (from < 4) {
        anchor = "start";
        from = Math.max(4, Math.min(markerX + 8, VISUAL_WIDTH - 4 - fitted));
      }
      const to = from + fitted;

      let tier = 0;
      while (
        (onTier[tier] ?? []).some((span) => from < span.to + TIMELINE_GUTTER && span.from - TIMELINE_GUTTER < to) ||
        leaders.some((leader) => leader.tier > tier && from - 4 < leader.x && leader.x < to + 4)
      ) {
        tier += 1;
      }
      (onTier[tier] ??= []).push({ from, to });
      if (tier > 0) leaders.push({ tier, x: markerX });

      return {
        anchor,
        covered,
        date: truncateToWidth(date, TIMELINE_DATE_FONT, fitted),
        endX: scale(entry.event.until ?? entry.event.at),
        extent: { from, to },
        index: entry.index,
        isSpan: entry.event.until !== undefined && entry.event.until !== entry.event.at,
        label: truncateToWidth(label, TIMELINE_LABEL_FONT, fitted),
        textX: anchor === "start" ? from : to,
        tier,
        uncertain: entry.event.uncertain === true,
        x: markerX,
      };
    });

    const tiers = Math.max(1, onTier.length);
    const axisY = cursor + tiers * TIMELINE_TIER_HEIGHT;
    lanes.push({ axisY, name });
    for (const entry of placed) {
      const dateY = axisY - 12 - entry.tier * TIMELINE_TIER_HEIGHT;
      marks.push({ ...entry, axisY, dateY, labelY: dateY - 13 });
    }
    cursor = axisY + TIMELINE_BELOW_AXIS;
  }

  return {
    height: cursor + 10,
    lanes,
    left: TIMELINE_EDGE,
    marks: marks.sort((a, b) => a.index - b.index),
    right: VISUAL_WIDTH - TIMELINE_EDGE,
  };
}

// ─────────────────────────────────────────────────────────────────────── construction

const CONSTRUCTION_HEIGHT = VISUAL_HEIGHT;
const CONSTRUCTION_PAD = 52;
const ANGLE_ARC_RADIUS = 22;
const ANGLE_SQUARE = 16;
const RIGHT_ANGLE_TOLERANCE = 0.5;

export interface ConstructionPoint {
  readonly id: string;
  readonly cx: number;
  readonly cy: number;
  readonly label: string;
  readonly labelX: number;
  readonly labelY: number;
  readonly anchor: TextAnchor;
}

export interface ConstructionSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly label?: string;
  readonly labelX: number;
  readonly labelY: number;
  readonly anchor: TextAnchor;
}

export interface ConstructionAngle {
  readonly degrees: number;
  /** The arc, or the little square that means a right angle. */
  readonly markPath: string;
  readonly labelX: number;
  readonly labelY: number;
  readonly anchor: TextAnchor;
}

export interface ConstructionPlacement {
  readonly height: number;
  readonly points: readonly ConstructionPoint[];
  readonly segments: readonly ConstructionSegment[];
  readonly circles: readonly { readonly cx: number; readonly cy: number; readonly r: number }[];
  readonly angles: readonly ConstructionAngle[];
}

/**
 * A figure fitted to the frame, with nothing written on top of anything else.
 *
 * 🔴 EVERY LABEL IS PUSHED AWAY FROM THE CENTRE OF THE FIGURE, which is the one rule that generalises.
 * Point names used to sit up and to the right whatever the shape, so on a triangle with its right
 * angle at the origin the name of the vertex, the length of the side and the angle mark all landed in
 * the same square centimetre. "Outward" needs no knowledge of what is being drawn: a vertex label
 * goes away from the centroid, a side label goes to the side of the line the figure is not on, and an
 * angle mark goes INWARD along its own bisector — the one place that is guaranteed to be free,
 * because the vertex label just left it.
 */
export function layoutConstruction(visual: ConstructionVisual): ConstructionPlacement {
  const xs = visual.points.map((point) => point.x);
  const ys = visual.points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min(
    (VISUAL_WIDTH - CONSTRUCTION_PAD * 2) / (maxX - minX || 1),
    (CONSTRUCTION_HEIGHT - CONSTRUCTION_PAD * 2) / (maxY - minY || 1),
  );
  const drawnWidth = (maxX - minX) * scale;
  const drawnHeight = (maxY - minY) * scale;
  const originX = (VISUAL_WIDTH - drawnWidth) / 2;
  const originY = (CONSTRUCTION_HEIGHT - drawnHeight) / 2;
  // y is flipped: mathematics counts upward and SVG counts downward, and a figure drawn without this
  // is a correct construction mirrored, which looks like a different figure.
  const px = (value: number) => originX + (value - minX) * scale;
  const py = (value: number) => originY + drawnHeight - (value - minY) * scale;
  const at = (id: string) => visual.points.find((point) => point.id === id);

  const centreX = visual.points.reduce((total, point) => total + px(point.x), 0) / visual.points.length;
  const centreY = visual.points.reduce((total, point) => total + py(point.y), 0) / visual.points.length;

  const points = visual.points.map((point) => {
    const cx = px(point.x);
    const cy = py(point.y);
    const away = unit(cx - centreX, cy - centreY, { x: 0, y: -1 });
    const anchor: TextAnchor = away.x > 0.2 ? "start" : away.x < -0.2 ? "end" : "middle";
    return {
      anchor,
      cx,
      cy,
      id: point.id,
      label: point.label ?? point.id,
      labelX: cx + away.x * 14,
      // Text sits on its baseline, so a label pushed downward needs the extra to clear the glyph.
      labelY: cy + away.y * 14 + (away.y > 0 ? 9 : 0),
    };
  });

  const segments = (visual.segments ?? []).flatMap((segment) => {
    const from = at(segment.from);
    const to = at(segment.to);
    if (!from || !to) return [];
    const x1 = px(from.x);
    const y1 = py(from.y);
    const x2 = px(to.x);
    const y2 = py(to.y);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const away = unit(midX - centreX, midY - centreY, { x: 0, y: -1 });
    return [
      {
        anchor: (away.x > 0.3 ? "start" : away.x < -0.3 ? "end" : "middle") as TextAnchor,
        ...(segment.label ? { label: segment.label } : {}),
        labelX: midX + away.x * 13,
        labelY: midY + away.y * 13 + (away.y > 0 ? 8 : 0),
        x1,
        x2,
        y1,
        y2,
      },
    ];
  });

  const circles = (visual.circles ?? []).flatMap((circle) => {
    const centre = at(circle.centre);
    const through = at(circle.through);
    if (!centre || !through) return [];
    return [
      {
        cx: px(centre.x),
        cy: py(centre.y),
        r: Math.hypot(through.x - centre.x, through.y - centre.y) * scale,
      },
    ];
  });

  const angles = (visual.angles ?? []).flatMap((angle) => {
    const vertex = at(angle.at);
    const first = at(angle.from);
    const second = at(angle.to);
    if (!vertex || !first || !second) return [];
    const vx = px(vertex.x);
    const vy = py(vertex.y);
    const a = unit(px(first.x) - vx, py(first.y) - vy, { x: 1, y: 0 });
    const b = unit(px(second.x) - vx, py(second.y) - vy, { x: 0, y: -1 });
    const bisector = unit(a.x + b.x, a.y + b.y, { x: 0, y: -1 });
    const isRight = Math.abs(angle.degrees - 90) < RIGHT_ANGLE_TOLERANCE;

    // 🔴 A RIGHT ANGLE GETS A SQUARE, WHICH IS NOT DECORATION. It is the convention in every field
    // that draws one, and it is the one angle a reader is expected to recognise without reading a
    // number — so drawing an arc there says "some angle" where the figure means "exactly this one".
    const markPath = isRight
      ? `M ${vx + a.x * ANGLE_SQUARE} ${vy + a.y * ANGLE_SQUARE} ` +
        `L ${vx + (a.x + b.x) * ANGLE_SQUARE} ${vy + (a.y + b.y) * ANGLE_SQUARE} ` +
        `L ${vx + b.x * ANGLE_SQUARE} ${vy + b.y * ANGLE_SQUARE}`
      : `M ${vx + a.x * ANGLE_ARC_RADIUS} ${vy + a.y * ANGLE_ARC_RADIUS} ` +
        `A ${ANGLE_ARC_RADIUS} ${ANGLE_ARC_RADIUS} 0 0 ${sweep(a, b)} ` +
        `${vx + b.x * ANGLE_ARC_RADIUS} ${vy + b.y * ANGLE_ARC_RADIUS}`;

    const reach = isRight ? ANGLE_SQUARE + 20 : ANGLE_ARC_RADIUS + 14;
    return [
      {
        anchor: (bisector.x > 0.2 ? "start" : bisector.x < -0.2 ? "end" : "middle") as TextAnchor,
        degrees: angle.degrees,
        labelX: vx + bisector.x * reach,
        labelY: vy + bisector.y * reach + 4,
        markPath,
      },
    ];
  });

  return { angles, circles, height: CONSTRUCTION_HEIGHT, points, segments };
}

/** A direction of length one, with a stated answer for the case where there is no direction. */
function unit(x: number, y: number, fallback: { x: number; y: number }): { x: number; y: number } {
  const length = Math.hypot(x, y);
  if (length < 1e-9) return fallback;
  return { x: x / length, y: y / length };
}

/** Which way round an SVG arc goes between two rays, so it covers the angle rather than its reflex. */
function sweep(a: { x: number; y: number }, b: { x: number; y: number }): 0 | 1 {
  return a.x * b.y - a.y * b.x > 0 ? 1 : 0;
}

// ── circuit ────────────────────────────────────────────────────────────────────────────────────
//
// 🔴 A SERIES/PARALLEL TREE LAYS OUT WITH SCHOOL ARITHMETIC, WHICH IS WHY THE SPEC IS A TREE. A
// series group is its parts left to right with wire between them; a parallel group is its parts
// stacked between two vertical rails; the whole network sits in the top side of a rectangular loop
// with the supply in the bottom side, which is the drawing on the first page of every circuits
// course. An arbitrary netlist would need an auto-router, and auto-routers draw wires through
// components — the validator refuses what this arithmetic cannot place.

/** The slot one component occupies, in natural units. The glyph draws its own leads across it. */
const PART_W = 96;
const PART_H = 40;
/** Wire run between series neighbours. */
const SERIES_GAP = 18;
/** Vertical room between parallel branches: a value line below one, a label line above the next. */
const BRANCH_GAP = 34;
/** Stub from a parallel group's edge to its rail. */
const RAIL_STUB = 24;
/** Wire from a loop corner into the network. */
const LOOP_LEAD = 26;
/** Between the network and the return wire the supply sits on. */
const LOOP_DROP = 46;
/** The supply's slot on the return wire. */
const SUPPLY_W = 72;
/** Frame margin, and the room under the return wire for the supply's label. */
const CIRCUIT_MARGIN = 10;
const SUPPLY_LABEL_ROOM = 22;

interface CircuitNodeSize {
  readonly w: number;
  readonly h: number;
}

export interface CircuitPartBox {
  readonly component: CircuitComponent;
  readonly label?: string;
  readonly value?: string;
  /** Centre of the slot, in final pixels. */
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
}

export interface CircuitWire {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface CircuitPlacement {
  readonly height: number;
  readonly wires: readonly CircuitWire[];
  /** Junction dots, where three or more wires meet. */
  readonly dots: readonly { x: number; y: number }[];
  readonly parts: readonly CircuitPartBox[];
  readonly supply: { cx: number; cy: number; w: number; h: number; label?: string } | null;
  /** How far the natural drawing was shrunk to fit the column. 1 for most circuits. */
  readonly scale: number;
}

function isCircuitGroup(part: CircuitPart | CircuitGroup): part is CircuitGroup {
  return "arrangement" in part;
}

function measureCircuit(node: CircuitPart | CircuitGroup): CircuitNodeSize {
  if (!isCircuitGroup(node)) return { h: PART_H, w: PART_W };
  const sizes = node.parts.map(measureCircuit);
  if (node.arrangement === "series") {
    return {
      h: Math.max(...sizes.map((size) => size.h)),
      w: sizes.reduce((sum, size) => sum + size.w, 0) + SERIES_GAP * (sizes.length - 1),
    };
  }
  return {
    h: sizes.reduce((sum, size) => sum + size.h, 0) + BRANCH_GAP * (sizes.length - 1),
    w: Math.max(...sizes.map((size) => size.w)) + 2 * RAIL_STUB,
  };
}

interface CircuitDraft {
  wires: CircuitWire[];
  dots: { x: number; y: number }[];
  parts: Array<{ component: CircuitComponent; label?: string; value?: string; cx: number; cy: number }>;
}

/** Place a node whose entry sits at (x, yc); current flows through to (x + width, yc). */
function placeCircuit(node: CircuitPart | CircuitGroup, x: number, yc: number, draft: CircuitDraft): void {
  if (!isCircuitGroup(node)) {
    draft.parts.push({
      component: node.component,
      cx: x + PART_W / 2,
      cy: yc,
      ...(node.label ? { label: node.label } : {}),
      ...(node.value ? { value: node.value } : {}),
    });
    return;
  }

  const sizes = node.parts.map(measureCircuit);
  if (node.arrangement === "series") {
    let cursor = x;
    node.parts.forEach((part, index) => {
      placeCircuit(part, cursor, yc, draft);
      cursor += sizes[index]!.w;
      if (index < node.parts.length - 1) {
        draft.wires.push({ x1: cursor, x2: cursor + SERIES_GAP, y1: yc, y2: yc });
        cursor += SERIES_GAP;
      }
    });
    return;
  }

  const size = measureCircuit(node);
  const innerW = size.w - 2 * RAIL_STUB;
  const leftRail = x + RAIL_STUB;
  const rightRail = x + size.w - RAIL_STUB;
  draft.wires.push({ x1: x, x2: leftRail, y1: yc, y2: yc });
  draft.wires.push({ x1: rightRail, x2: x + size.w, y1: yc, y2: yc });

  let top = yc - size.h / 2;
  const centres: number[] = [];
  node.parts.forEach((part, index) => {
    const branch = sizes[index]!;
    const by = top + branch.h / 2;
    centres.push(by);
    const bx = leftRail + (innerW - branch.w) / 2;
    // The rail-to-branch runs. Zero-length when the branch fills the rails, which draws nothing.
    if (bx > leftRail) draft.wires.push({ x1: leftRail, x2: bx, y1: by, y2: by });
    if (bx + branch.w < rightRail) draft.wires.push({ x1: bx + branch.w, x2: rightRail, y1: by, y2: by });
    placeCircuit(part, bx, by, draft);
    top += branch.h + BRANCH_GAP;
  });

  const first = centres[0]!;
  const last = centres[centres.length - 1]!;
  draft.wires.push({ x1: leftRail, x2: leftRail, y1: first, y2: last });
  draft.wires.push({ x1: rightRail, x2: rightRail, y1: first, y2: last });
  for (const by of centres) {
    draft.dots.push({ x: leftRail, y: by });
    draft.dots.push({ x: rightRail, y: by });
  }
}

/**
 * Lay a validated circuit out as wires, dots and component slots.
 *
 * 🔴 THE WHOLE DRAWING IS SCALED, NEVER REFLOWED. A circuit wider than the column shrinks uniformly
 * — wire joins stay joined and nothing overlaps that did not already — where a reflow would be a
 * second layout algorithm with its own defects. Text stays at reading size because the renderer
 * draws it at fixed font sizes AT the scaled positions, which is also why label collisions at small
 * scales are bounded by the part count the validator already caps.
 */
export function layoutCircuit(visual: CircuitVisual): CircuitPlacement {
  const network = measureCircuit(visual.elements);
  const draft: CircuitDraft = { dots: [], parts: [], wires: [] };
  const hasSupply = visual.supply !== undefined;

  const naturalW = network.w + 2 * LOOP_LEAD;
  const yc = network.h / 2;
  placeCircuit(visual.elements, LOOP_LEAD, yc, draft);
  draft.wires.push({ x1: 0, x2: LOOP_LEAD, y1: yc, y2: yc });
  draft.wires.push({ x1: LOOP_LEAD + network.w, x2: naturalW, y1: yc, y2: yc });

  let naturalH = network.h;
  let supplyCentre: { cx: number; cy: number } | null = null;
  if (hasSupply) {
    const returnY = network.h / 2 + Math.max(network.h / 2, PART_H / 2) + LOOP_DROP;
    draft.wires.push({ x1: 0, x2: 0, y1: yc, y2: returnY });
    draft.wires.push({ x1: naturalW, x2: naturalW, y1: yc, y2: returnY });
    const cx = naturalW / 2;
    draft.wires.push({ x1: 0, x2: cx - SUPPLY_W / 2, y1: returnY, y2: returnY });
    draft.wires.push({ x1: cx + SUPPLY_W / 2, x2: naturalW, y1: returnY, y2: returnY });
    supplyCentre = { cx, cy: returnY };
    naturalH = returnY + PART_H / 2 + SUPPLY_LABEL_ROOM;
  }

  const scale = Math.min(1, (VISUAL_WIDTH - 2 * CIRCUIT_MARGIN) / naturalW);
  const offsetX = (VISUAL_WIDTH - naturalW * scale) / 2;
  const sx = (value: number) => offsetX + value * scale;
  const sy = (value: number) => CIRCUIT_MARGIN + value * scale;

  return {
    dots: draft.dots.map((dot) => ({ x: sx(dot.x), y: sy(dot.y) })),
    height: naturalH * scale + 2 * CIRCUIT_MARGIN,
    parts: draft.parts.map((part) => ({
      component: part.component,
      cx: sx(part.cx),
      cy: sy(part.cy),
      h: PART_H * scale,
      w: PART_W * scale,
      ...(part.label ? { label: part.label } : {}),
      ...(part.value ? { value: part.value } : {}),
    })),
    scale,
    supply: supplyCentre
      ? {
          cx: sx(supplyCentre.cx),
          cy: sy(supplyCentre.cy),
          h: PART_H * scale,
          w: SUPPLY_W * scale,
          ...(visual.supply?.label ? { label: visual.supply.label } : {}),
        }
      : null,
    wires: draft.wires.map((wire) => ({ x1: sx(wire.x1), x2: sx(wire.x2), y1: sy(wire.y1), y2: sy(wire.y2) })),
  };
}

// ── electron-pushing arrows: REMOVED 2026-08-26 ────────────────────────────────────────────────
//
// 🔴🔴🔴 `curlyArrow` AND ITS CLEARANCES LIVED HERE AND THE OWNER WITHDREW THEM. *"Bad mechanism
// arrows are worse than no arrows because they teach the chemistry incorrectly while also consuming
// engineering time like a small electrical fire."* Measured on the live page the day before: two of
// six lone-pair dots on a bromine sat INSIDE the letters, because clearance was one radius in every
// direction while an atom's label is a rectangle up to two and a half times wider than it is tall.
//
// 🔴 DO NOT RESTORE THIS FROM GIT WITHOUT A RENDERER THAT CAN BE TRUSTED WITH IT. The geometry was
// never the hard part; deciding where an arrow may run without crossing the structure it annotates
// is, and no library in the ecosystem solves it (Kekule.js models curly arrows as first-class
// objects but stores them as raw coordinates a human drags into place). A mechanism is now taught
// as clean structures plus `highlight` plus prose. See `canvas-visual.ts`.
