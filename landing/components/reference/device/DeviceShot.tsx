"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import "./device.css";

export type Point = [number, number];
/** Top-left, top-right, bottom-right, bottom-left, in the photograph's own pixels. */
export type Quad = [Point, Point, Point, Point];

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/**
 * The CSS `matrix3d` that lays a W×H box onto a four-point quad.
 *
 * 🔴 IT HAS TO BE PROJECTIVE. An affine transform (skew, rotate, scale) keeps parallel lines
 * parallel, so it can never make a screen narrower at the top than at the bottom the way a camera
 * sees one. This is Heckbert's square-to-quad, composed with a scale from the box to the unit
 * square, written column-major the way matrix3d reads it.
 */
export function quadMatrix(W: number, H: number, q: Quad): string {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2;
  const dy1 = y1 - y2;
  const dx2 = x3 - x2;
  const dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  let g = 0;
  let h = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const det = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / det;
    h = (dx1 * sy - sx * dy1) / det;
  }
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h * y3;
  const n = (v: number) => Number(v.toFixed(9));
  return `matrix3d(${n(a / W)},${n(d / W)},0,${n(g / W)},${n(b / H)},${n(e / H)},0,${n(h / H)},0,0,1,0,${n(x0)},${n(y0)},0,1)`;
}

/** A photographed device whose screen shows `children`, bent to the photograph's perspective. */
export function DeviceShot({
  photo,
  size,
  quad,
  screen,
  alt,
  eager,
  className,
  style,
  children,
}: {
  photo: string;
  /** The photograph's pixel size, which `quad` is measured in. */
  size: [number, number];
  quad: Quad;
  /** The logical size the screen content is laid out at before it is bent into place. */
  screen: [number, number];
  alt: string;
  eager?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const [W, H] = size;
  const ref = useRef<HTMLDivElement | null>(null);
  const [k, setK] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setK(el.clientWidth / W);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W]);

  const clip = `polygon(${quad.map(([x, y]) => `${((x / W) * 100).toFixed(3)}% ${((y / H) * 100).toFixed(3)}%`).join(", ")})`;
  const scaled = quad.map(([x, y]) => [x * k, y * k]) as Quad;

  return (
    <div ref={ref} className={cx("dv", className)} style={{ aspectRatio: `${W} / ${H}`, ...style }} data-ready={k > 0 ? "true" : undefined}>
      <span className="dv-off" style={{ clipPath: clip }} aria-hidden="true" />
      <div
        className="dv-screen"
        style={{ width: screen[0], height: screen[1], transform: k > 0 ? quadMatrix(screen[0], screen[1], scaled) : undefined }}
      >
        {children}
        <span className="dv-glare" aria-hidden="true" />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="dv-photo"
        src={photo}
        alt={alt}
        width={W}
        height={H}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={eager ? "high" : undefined}
      />
    </div>
  );
}

/**
 * A muted, looping product clip. It loads only as it nears the viewport and pauses when it leaves,
 * the way Sana's page drops its hero film into an "energy-saving" state off screen.
 */
export function LoopVideo({ src, poster, label, className }: { src: string; poster: string; label: string; className?: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // React sets `muted` as a property only after mount; autoplay policy reads it at play().
    v.muted = true;
    const reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = () => {
      if (!v.getAttribute("src")) v.setAttribute("src", src);
      if (!reduced) void v.play().catch(() => {});
    };
    if (typeof IntersectionObserver === "undefined") {
      start();
      return;
    }
    const io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : v.pause()), { rootMargin: "240px 0px" });
    io.observe(v);
    return () => io.disconnect();
  }, [src]);
  return <video ref={ref} className={cx("dv-video", className)} poster={poster} aria-label={label} muted loop playsInline preload="none" />;
}
