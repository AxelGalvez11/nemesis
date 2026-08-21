// What the mascot is looking at, when it is not the pointer.
//
// THE PROBLEM THIS SOLVES. Gaze is the character's strongest behaviour, and a mascot
// that only ever follows the cursor is a cursor-follower — it has no idea what is
// happening on the page. This is the other half: any part of the interface can say
// "look here", and the character turns toward it with the same inertia it turns toward a
// mouse.
//
// 🔴 IT IS A STORE, NOT AN EVENT SYSTEM. One current target, last writer wins, and
// anything that sets one is expected to clear it. An event stream would need the mascot
// to hold a queue and decide between competing claims, which is a scheduler, and a
// scheduler is how a mascot ends up looking in the wrong direction for reasons nobody
// can reconstruct.
//
// 🔴 AND THE RECT IS READ ON A TIMER, NEVER PER FRAME. `getBoundingClientRect` forces
// layout; doing it sixty times a second for a decorative gaze is exactly the kind of
// cost that does not show up in a profile as "the mascot" but does show up as jank while
// scrolling. Every 120ms is far finer than the eye's own settling time.

export type AttentionTarget =
  | { readonly kind: "element"; readonly el: Element }
  | { readonly kind: "point"; readonly x: number; readonly y: number }
  | null;

type Listener = (target: AttentionTarget) => void;

let current: AttentionTarget = null;
const listeners = new Set<Listener>();

/**
 * Point the mascot at something. Pass `null` to hand its attention back.
 *
 * A detached element is refused rather than stored: an element that has left the
 * document has a zero rect, and a zero rect resolves to the top-left corner of the
 * window — so the character would stare fixedly into the corner and never recover.
 */
export function lookAt(target: Element | { x: number; y: number } | null): void {
  let next: AttentionTarget = null;
  if (target instanceof Element) {
    if (target.isConnected) next = { kind: "element", el: target };
  } else if (target) {
    if (Number.isFinite(target.x) && Number.isFinite(target.y)) {
      next = { kind: "point", x: target.x, y: target.y };
    }
  }
  current = next;
  for (const fn of listeners) fn(current);
}

export function getAttention(): AttentionTarget {
  return current;
}

export function subscribeAttention(fn: Listener): () => void {
  listeners.add(fn);
  fn(current);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Resolves a target to a point in client coordinates, or null.
 *
 * A zero-sized box means the element is hidden or has been removed. Returning null for
 * it rather than its (0, 0) origin is the difference between the character letting its
 * attention go and it locking onto the corner of the screen forever.
 */
export function resolveAttention(target: AttentionTarget): { x: number; y: number } | null {
  if (!target) return null;
  if (target.kind === "point") return { x: target.x, y: target.y };
  if (!target.el.isConnected) return null;
  const r = target.el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/**
 * Marks an element as somewhere the mascot may look.
 *
 * Placed on a real element so a surface can opt in declaratively — the dock watches for
 * focus on anything carrying it and turns the character that way without the surface
 * having to import anything.
 */
export const ATTENTION_ATTR = "data-mascot-attention";
