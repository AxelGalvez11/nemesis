"use client";

import { useEffect, useRef, useState } from "react";

import { createView, type Metrics, type Quality, type ViewHandle } from "./harness";
import type { Candidate, Params } from "./types";

/**
 * One live candidate in one canvas.
 *
 * The view is rebuilt ONLY when the candidate changes. Params and ink go through
 * imperative setters on the handle, because rebuilding a WebGL context on every
 * slider drag would both stutter and burn through the browser's context budget.
 *
 * The `<canvas>` is created imperatively rather than rendered by React, and that
 * is load-bearing. Teardown calls `forceContextLoss()` to hand the context back
 * to the browser, and a canvas ELEMENT that has had its context force-lost can
 * never get another one — `getContext()` returns null on it forever. React's
 * StrictMode mounts every effect twice in development, so a React-owned canvas
 * would be killed by the first cleanup and then handed straight back to the
 * second mount, which crashes inside three.js on a null context. Making a fresh
 * element per view makes mount/unmount idempotent.
 */

type Props = {
  readonly candidate: Candidate;
  readonly params: Params;
  readonly ink: string;
  readonly showMetrics?: boolean;
  readonly quality?: Quality;
  readonly className?: string;
};

export function CandidateCanvas({
  candidate,
  params,
  ink,
  showMetrics = false,
  quality = "full",
  className,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<ViewHandle | null>(null);
  const paramsRef = useRef(params);
  const inkRef = useRef(ink);
  paramsRef.current = params;
  inkRef.current = ink;

  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const canvas = document.createElement("canvas");
    canvas.className = "pl-canvas";
    host.appendChild(canvas);

    const handle = createView(canvas, candidate, paramsRef.current, inkRef.current, quality);
    handleRef.current = handle;

    return () => {
      handleRef.current = null;
      handle.dispose();
      canvas.remove();
    };
  }, [candidate, quality]);

  useEffect(() => {
    handleRef.current?.setParams(params);
  }, [params]);

  useEffect(() => {
    handleRef.current?.setInk(ink);
  }, [ink]);

  useEffect(() => {
    if (!showMetrics) return;
    // Half-second sampling. Faster and the numbers flicker too much to read;
    // slower and a stutter is averaged away before it reaches the panel.
    const id = window.setInterval(() => {
      setMetrics(handleRef.current?.metrics() ?? null);
    }, 500);
    return () => window.clearInterval(id);
  }, [showMetrics]);

  return (
    <div ref={hostRef} className={`pl-canvas-wrap ${className ?? ""}`}>
      {showMetrics && metrics ? (
        <div className="pl-metrics" aria-hidden>
          {metrics.lost ? (
            <span className="pl-metrics-bad">context lost</span>
          ) : (
            <>
              <span>{metrics.visible.toLocaleString()} pts</span>
              <span>{metrics.drawCalls} draw</span>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
