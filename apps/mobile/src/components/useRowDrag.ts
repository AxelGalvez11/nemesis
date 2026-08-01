import { useCallback, useRef, useState } from "react";
import type { View } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import { useSharedValue, type SharedValue } from "react-native-reanimated";
import { hapticHoldRegistered } from "@/lib/haptics";

// Hold-then-drag a row onto a folder (owner 2026-07-23: "allow users to hold
// down on items to drag or drop, or long hold to open up minimenu"). Shared by
// the Library tree and the Study deck tree, which asked for identical behaviour.
//
// ONE gesture serves both halves of that sentence, because they start the same
// way. A Pan with `activateAfterLongPress` engages after the hold; what happens
// next depends on whether the finger moved:
//
//   hold, then move            -> drag; releasing over a folder moves the item
//   hold, then release in place-> the actions menu (onHold)
//   quick tap                  -> never reaches this gesture at all
//
// That last line is why the rows keep their ordinary <Pressable> underneath
// rather than racing a Tap gesture here. `activateAfterLongPress` leaves the
// Pan inactive for a quick tap, so the Pressable handles it — including its
// pressed-state styling, which a Tap gesture has no equivalent for. When the
// hold does elapse, the Pan activates and RNGH cancels the Pressable's touch,
// so `onPress` cannot also fire. The row's own `onLongPress` must be REMOVED
// when adopting this, or the menu would open twice.
//
// HIT-TESTING USES WINDOW COORDINATES, measured once when the drag starts.
// Row `onLayout` reports a position relative to whatever the parent happens to
// be — which is a FlatList cell in the Library and the scroll content in Study —
// so it can't be compared against a finger position across both screens.
// `measureInWindow` gives one coordinate space that is true on either. Measuring
// once at drag start is enough because the drag gesture owns the touch for its
// duration, so the list underneath cannot scroll and move the rows.
//
// Not included, deliberately: auto-scrolling when you drag near the top or
// bottom edge. You can only drop on a row you can see.

/** How long to hold before the row is "picked up". Long enough not to fire
 *  while scrolling, short enough not to feel stuck. */
const HOLD_MS = 300;
/** Movement under this (points) counts as "released in place" -> menu. */
const MOVE_SLOP = 10;

interface RowRect {
  y: number;
  height: number;
}

interface RegisteredRow {
  node: View | null;
  /** Whether the dragged row may be dropped BETWEEN this one and its
   *  neighbours — i.e. this row takes part in hand-arranged order. Notes do;
   *  folder headings do not. */
  reorderable: boolean;
  /** Whether a dragged row may be dropped ONTO this one (folders only). */
  droppable: boolean;
  /** A LAST-RESORT target, only used when no ordinary one is under the finger.
   *  The "out of every folder" zone is one: it now covers the whole list area
   *  rather than a strip (owner 2026-07-24), so it overlaps every folder row on
   *  screen and would win a first-match hit test outright — which registration
   *  order alone happens to decide. Every drop would silently become "move to
   *  top level". Fallbacks are checked in a second pass instead. */
  fallback: boolean;
}

export interface RowDrag {
  /** Ref callback for a row's outermost View. `droppable` marks folders;
   *  `fallback` marks a catch-all zone that only wins when nothing else is
   *  under the finger (see RegisteredRow.fallback). */
  registerRow: (
    key: string,
    droppable: boolean,
    fallback?: boolean,
    reorderable?: boolean,
  ) => (node: View | null) => void;
  /** The gesture for one row. `draggable` false still gives hold-for-menu unless
   *  `holdForMenu` is also false. */
  gestureFor: (
    key: string,
    opts: {
      draggable: boolean;
      /** Reject illegal destinations (a folder into itself, the row's own
       *  current parent) so nothing highlights that couldn't accept the drop. */
      canDropOn: (targetKey: string) => boolean;
      /** Hold-in-place opens the row menu (onHold). Default true; pass false to
       *  suppress it while another mode owns taps — e.g. Study's multi-select,
       *  where a slightly-slow tap must toggle selection, not pop the menu. */
      holdForMenu?: boolean;
      /** Report this row as `activeKey` on hold even when there is nowhere to
       *  drop it. Defaults to `draggable`, which is what every list wants.
       *
       *  The sidebar's chats want the other combination (owner 2026-08-01: "the
       *  entire card should appear to be picked up, same goes for side bar
       *  chats"). Chats have no folders, so dragging one is meaningless — but
       *  the PICKING UP is the feedback that a hold registered, and without it
       *  the only thing that happens during the hold is a haptic. With this on,
       *  a non-draggable row still lifts, and releasing it anywhere opens the
       *  menu rather than needing to have stayed still. */
      lift?: boolean;
    },
  ) => ReturnType<typeof Gesture.Pan>;
  /** The row currently being dragged, or null. */
  activeKey: string | null;
  /** The droppable row under the finger, or null. */
  overKey: string | null;
  /** While reordering: the reorderable row the dragged one would land ABOVE,
   *  or "" for "past the last row". Null when not reordering — i.e. the finger
   *  is over a folder, or has not left the row it picked up. Drives the
   *  insertion line the screen draws. */
  insertBeforeKey: string | null;
  /** Finger position in window coordinates — drives the floating drag chip. */
  fingerX: SharedValue<number>;
  fingerY: SharedValue<number>;
}

export function useRowDrag({
  onDrop,
  onHold,
  onReorder,
}: {
  /** Fired when a dragged row is released over a valid folder. */
  onDrop: (sourceKey: string, targetKey: string) => void;
  /** Fired when a row is held and released without moving. `x`/`y` are the
   *  release point in WINDOW coordinates (gesture absoluteX/absoluteY) — what a
   *  touch-anchored MiniMenu positions from. Callers that open a fixed sheet
   *  (Study) just ignore them. */
  onHold: (key: string, x: number, y: number) => void;
  /** Fired when a dragged row is released BETWEEN rows rather than onto a
   *  folder. `beforeKey` is the row it should land above, or "" for the end of
   *  the list. Omit to leave reordering off — Study does, for now. */
  onReorder?: (sourceKey: string, beforeKey: string) => void;
}): RowDrag {
  const rows = useRef(new Map<string, RegisteredRow>());
  const rects = useRef(new Map<string, RowRect>());
  // Catch-all zones, kept apart so they can be tested after everything else.
  const fallbackRects = useRef(new Map<string, RowRect>());
  // Every row's rect, droppable or not — the dragged row's own rectangle is
  // what tells a drifted hold apart from a deliberate drop (see hitTest).
  const allRects = useRef(new Map<string, RowRect>());
  // Rows that take part in hand-arranged order, for the insertion hit test.
  const reorderRects = useRef(new Map<string, RowRect>());
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  // Read inside gesture callbacks, which close over the value at construction
  // time — the gesture is rebuilt on every render, but a drag in flight keeps
  // the closure it started with, so the live value has to come from a ref.
  const overKeyRef = useRef<string | null>(null);
  const [insertBeforeKey, setInsertBeforeKey] = useState<string | null>(null);
  const insertBeforeRef = useRef<string | null>(null);
  const fingerX = useSharedValue(0);
  const fingerY = useSharedValue(0);

  // Ref callbacks are CACHED PER KEY, and this matters more than it looks: a
  // fresh closure every render makes React detach (call with null) and
  // re-attach every row's ref on every render. Picking a row up calls
  // setActiveKey, so the re-render that follows would tear down every ref the
  // drag had just measured — every drop target would vanish the instant you
  // lifted a row. A stable callback per key means React leaves them alone.
  const refCallbacks = useRef(new Map<string, (node: View | null) => void>());

  const registerRow = useCallback((key: string, droppable: boolean, fallback = false, reorderable = false) => {
    const existing = refCallbacks.current.get(key);
    if (existing) {
      // Keep `droppable` current without changing the callback's identity — a
      // row can change kind between renders (search flattens the tree).
      const row = rows.current.get(key);
      if (row) {
        row.droppable = droppable;
        row.fallback = fallback;
        row.reorderable = reorderable;
      }
      return existing;
    }
    const callback = (node: View | null) => {
      if (node) rows.current.set(key, { droppable, fallback, node, reorderable });
      else {
        rows.current.delete(key);
        refCallbacks.current.delete(key);
      }
    };
    refCallbacks.current.set(key, callback);
    return callback;
  }, []);

  /** Snapshot every registered row's window rect. Fire-and-forget:
   *  measureInWindow answers on a later frame, which lands well before a
   *  finger has travelled anywhere meaningful.
   *
   *  EVERY row, not only the droppable ones: the row being dragged is usually
   *  not a drop target itself (a note, a deck), and hitTest needs its rectangle
   *  to tell "I let go without going anywhere" apart from "I aimed at the space
   *  outside the folders". */
  const measureRows = useCallback(() => {
    rects.current.clear();
    fallbackRects.current.clear();
    allRects.current.clear();
    reorderRects.current.clear();
    for (const [key, row] of rows.current) {
      if (!row.node) continue;
      const droppableInto = row.fallback ? fallbackRects.current : rects.current;
      row.node.measureInWindow((_x, y, _width, height) => {
        allRects.current.set(key, { height, y });
        if (row.reorderable) reorderRects.current.set(key, { height, y });
        if (row.droppable) droppableInto.set(key, { height, y });
      });
    }
  }, []);

  /** Ordinary targets first, catch-all zones only if none of them matched.
   *
   *  TWO PASSES, not one, and that is load-bearing rather than tidy: the
   *  out-of-folders zone spans the whole list now, so it contains every folder
   *  row's rectangle. A single first-match loop over one Map would resolve
   *  essentially every drop to it — and which one won would come down to
   *  registration order, so it would look like folders "sometimes" worked.
   *
   *  TWO WAYS TO ANSWER "NOWHERE", and both matter because the fallback zone is
   *  legal almost everywhere:
   *
   *   - The finger is over a real row that REFUSED the drop. Refusing is not
   *     the same as being absent: dropping a note on the folder it already
   *     lives in, or a folder onto its own descendant, has to do NOTHING. Left
   *     to fall through, each of those became "move to the top level" — the
   *     student aimed at the folder their note was already in and watched it
   *     get yanked out of it.
   *   - The finger never left the row it picked up. That is a hold that
   *     drifted, not a move. MOVE_SLOP alone can't tell the difference: 15pt of
   *     drift while opening the actions menu counts as movement, and with a
   *     whole-list fallback zone underneath, letting go moved the deck out of
   *     its folder and never opened the menu.
   */
  const hitTest = useCallback(
    (windowY: number, canDropOn: (key: string) => boolean, sourceKey: string): string | null => {
      const inside = (rect: RowRect) => windowY >= rect.y && windowY < rect.y + rect.height;
      let refused = false;
      for (const [key, rect] of rects.current) {
        if (!inside(rect)) continue;
        if (canDropOn(key)) return key;
        refused = true;
      }
      if (refused) return null;
      const own = allRects.current.get(sourceKey);
      if (own && inside(own)) return null;
      for (const [key, rect] of fallbackRects.current) {
        if (inside(rect) && canDropOn(key)) return key;
      }
      return null;
    },
    [],
  );

  /**
   * Which gap the finger is in, among the reorderable rows.
   *
   * Compared against each row's MIDPOINT, not its top edge: the half of a row
   * you are over is what decides whether you land above or below it, and that
   * is what makes a drag feel like it snaps to the nearer gap rather than
   * lagging a row behind the finger.
   *
   * Returns the key to land ABOVE, or "" for past the last row. Null means the
   * finger is above the whole list, where there is nothing to reorder against.
   */
  const insertionTest = useCallback((windowY: number, sourceKey: string): string | null => {
    let best: string | null = null;
    // Smallest y wins, so this starts high. (It started at -Infinity in a first
    // pass, which made the comparison always false and left the result riding
    // on Map iteration order — right by accident, wrong the moment rows are
    // registered in any other order.)
    let bestY = Infinity;
    let sawAny = false;
    for (const [key, rect] of reorderRects.current) {
      if (key === sourceKey) continue;
      sawAny = true;
      const middle = rect.y + rect.height / 2;
      if (windowY < middle) {
        // The topmost row whose midpoint is still below the finger wins.
        if (best === null || rect.y < bestY) {
          best = key;
          bestY = rect.y;
        }
      }
    }
    if (!sawAny) return null;
    return best ?? "";
  }, []);

  const gestureFor = useCallback(
    (
      key: string,
      opts: {
        draggable: boolean;
        canDropOn: (targetKey: string) => boolean;
        holdForMenu?: boolean;
        lift?: boolean;
      },
    ) => {
      const lifts = opts.lift ?? opts.draggable;
      return Gesture.Pan()
        .runOnJS(true)
        .activateAfterLongPress(HOLD_MS)
        .onStart((event) => {
          fingerX.value = event.absoluteX;
          fingerY.value = event.absoluteY;
          // The gesture only reaches onStart after HOLD_MS, so this IS the
          // moment the hold registers — the same instant the row lifts. Skipped
          // when the hold leads nowhere (select mode switches both off), because
          // a tap promising something that never happens is worse than none.
          if (opts.draggable || lifts || (opts.holdForMenu ?? true)) hapticHoldRegistered();
          // Measuring first, then publishing: setActiveKey re-renders, and the
          // drop targets have to have been read before anything else happens.
          if (opts.draggable) measureRows();
          if (lifts) setActiveKey(key);
        })
        .onUpdate((event) => {
          fingerX.value = event.absoluteX;
          fingerY.value = event.absoluteY;
          if (!opts.draggable) return;
          const next = hitTest(event.absoluteY, opts.canDropOn, key);
          if (next !== overKeyRef.current) {
            overKeyRef.current = next;
            setOverKey(next);
          }
          // Reordering is what happens when the finger is NOT over a folder:
          // dropping ONTO something and dropping BETWEEN things are the same
          // gesture, told apart by where it ends. A folder under the finger
          // always wins, so aiming at a folder never leaves a stray line behind.
          const gap = onReorder && next === null ? insertionTest(event.absoluteY, key) : null;
          if (gap !== insertBeforeRef.current) {
            insertBeforeRef.current = gap;
            setInsertBeforeKey(gap);
          }
        })
        .onEnd((event) => {
          const moved = Math.hypot(event.translationX, event.translationY) > MOVE_SLOP;
          const target = overKeyRef.current;
          const gap = insertBeforeRef.current;
          if (opts.draggable && moved && target) onDrop(key, target);
          // No folder under the finger, but a gap was: a rearrange.
          else if (opts.draggable && moved && gap !== null && onReorder) onReorder(key, gap);
          // Held and let go without going anywhere: that's the menu — unless the
          // caller suppressed it (multi-select owns taps there). The release
          // point (window coords) rides along so a MiniMenu can open right where
          // the finger is.
          //
          // A row that cannot be dragged opens the menu WHEREVER it is released,
          // drift or no drift. MOVE_SLOP exists to tell a deliberate move apart
          // from a wobbly hold, and with nothing to move onto there is no such
          // distinction left to draw — insisting on stillness would just mean
          // some holds silently did nothing.
          else if ((!moved || !opts.draggable) && (opts.holdForMenu ?? true)) {
            onHold(key, event.absoluteX, event.absoluteY);
          }
        })
        // Finalize, not End: it runs whether the gesture ended, was cancelled,
        // or lost the race, so the lifted-row styling can never get stuck on.
        .onFinalize(() => {
          overKeyRef.current = null;
          insertBeforeRef.current = null;
          setActiveKey(null);
          setOverKey(null);
          setInsertBeforeKey(null);
        });
    },
    [measureRows, hitTest, insertionTest, onDrop, onHold, onReorder, fingerX, fingerY],
  );

  return { activeKey, fingerX, fingerY, gestureFor, insertBeforeKey, overKey, registerRow };
}
