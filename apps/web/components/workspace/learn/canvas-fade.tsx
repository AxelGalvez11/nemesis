"use client";

// The wrapper that makes content leave as well as arrive.
//
// 🔴 THE DECISIONS ARE IN `lib/learn/canvas-crossfade.ts`. What is here is the one thing that cannot
// be a pure function: holding a React subtree past the moment its parent stopped rendering it.

import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  FADE_IN_MS,
  FADE_OUT_MS,
  fadeSettle,
  fadeStyle,
  fadeSwap,
  fadeTo,
  initialFade,
} from "@/lib/learn/canvas-crossfade";

export function CanvasFade({ contentKey, children }: { contentKey: string; children: ReactNode }) {
  const [state, setState] = useState(() => initialFade(contentKey));

  /** What the caller is rendering right now, always current. */
  const latest = useRef<ReactNode>(children);
  latest.current = children;
  /** The identity of whatever `held` belongs to. */
  const heldKey = useRef(contentKey);
  /** The subtree to paint while the outgoing content fades. */
  const held = useRef<ReactNode>(children);
  /** The destination, read by the timer rather than captured, so a change mid-fade still lands. */
  const incoming = useRef(contentKey);
  incoming.current = contentKey;

  // 🔴 DECLARED BEFORE THE SNAPSHOT EFFECT BELOW, AND THE ORDER IS LOAD-BEARING. React runs effects
  // in declaration order, so this sees `held` still holding the OUTGOING subtree.
  useEffect(() => {
    setState((current) => fadeTo(current, contentKey));
  }, [contentKey]);

  // 🔴 ONLY WHILE THE KEY IS STABLE. Updating unconditionally would overwrite the outgoing subtree
  // with the incoming one on the very render that starts the transition, and the fade-out would
  // then play on the new content — the right animation on the wrong element, which looks like a
  // flicker rather than like a bug and would have survived review.
  useEffect(() => {
    if (contentKey === heldKey.current) held.current = children;
  });

  useEffect(() => {
    if (state.phase === "leaving") {
      const timer = setTimeout(() => {
        heldKey.current = incoming.current;
        held.current = latest.current;
        setState((current) => fadeSwap(current, incoming.current));
      }, FADE_OUT_MS);
      return () => clearTimeout(timer);
    }
    if (state.phase === "entering") {
      const timer = setTimeout(() => setState(fadeSettle), FADE_IN_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [state.phase]);

  const style = fadeStyle(state);

  return (
    <div
      style={{
        opacity: style.opacity,
        // 🔴 NO TRANSITION AT REST. A settled element carrying one would fade on its very first
        // paint, so every canvas would open by dissolving into view.
        transition: style.ms > 0 ? `opacity ${style.ms}ms ease-out` : undefined,
      }}
    >
      {style.holdPrevious ? held.current : children}
    </div>
  );
}
