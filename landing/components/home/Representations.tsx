"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * Section 3 — the same Canvas, changing representation with the problem.
 *
 * NOT a feature grid. Six cards with icons is the single fastest way to make a
 * product look like every other AI SaaS page, and it would also be describing the
 * capability instead of showing it. Three large demonstrations, alternating sides,
 * each one actually doing the thing it claims.
 *
 * ── THE THREE SUBJECTS ARE FROM THREE DIFFERENT FIELDS ON PURPOSE ─────────────
 *
 * Law, engineering, and maths. Nemesis is a field-agnostic academic OS, and the
 * fastest way to lose that is a landing page whose every example is medical — a
 * visitor reads three examples and concludes it is a med-school tool. The Canvas
 * section above carries a physiology thread; these deliberately do not.
 *
 * ── NO IMPLEMENTATION NAMES IN THE COPY ───────────────────────────────────────
 *
 * Diagrams are rendered with Mermaid internally and 3D with Three.js, and neither
 * is mentioned. A student does not care, and naming your libraries on a landing
 * page addresses developers who are not the customer.
 */

export function Representations() {
  return (
    <section className="reps" id="representations">
      <div className="wrap">
        <Demo
          label="diagrams"
          title="understand structure"
          copy="When the shape of an argument is the thing to learn, it gets drawn."
          demo={<StructureDiagram />}
        />
        <Demo
          label="interactive 3D"
          title="see what words can't show"
          copy="When something is spatial, you get to turn it over."
          demo={<WireModel />}
          flip
        />
        <Demo
          label="math · graphs · visual reasoning"
          title="work it out"
          copy="When an idea lives in how a quantity behaves, it gets plotted."
          demo={<Plot />}
        />

        <p className="reps-line reveal">
          The Canvas chooses the representation that makes the idea easiest to understand.
        </p>
      </div>
    </section>
  );
}

function Demo({
  label,
  title,
  copy,
  demo,
  flip = false,
}: {
  readonly label: string;
  readonly title: string;
  readonly copy: string;
  readonly demo: React.ReactNode;
  readonly flip?: boolean;
}) {
  return (
    <div className="reps-row reveal" data-flip={flip || undefined}>
      <div className="reps-copy">
        <p className="reps-label">{label}</p>
        <h3>{title}</h3>
        <p className="reps-sub">{copy}</p>
      </div>
      <div className="reps-demo">{demo}</div>
    </div>
  );
}

/**
 * A structure diagram. The subject is contract formation, because the shape of a
 * legal test — a chain of conditions where one failure defeats the whole — is a
 * case where the diagram genuinely teaches better than the sentence.
 */
function StructureDiagram() {
  const ref = useRef<SVGSVGElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setDrawn(true);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <svg
      ref={ref}
      className="repsvg"
      data-drawn={drawn || undefined}
      viewBox="0 0 420 250"
      role="img"
      aria-label="Diagram: offer, acceptance, consideration and intention combine to form a contract"
    >
      <g className="repsvg-edges">
        <path d="M118 60 L196 60" />
        <path d="M118 118 L196 118" />
        <path d="M118 176 L196 176" />
        <path d="M288 60 L326 60 L326 118" />
        <path d="M288 118 L326 118" />
        <path d="M288 176 L326 176 L326 118" />
      </g>
      {/* Column widths are set by the LONGEST label in each column, measured in the
          mono face at 10px. "consideration" is thirteen characters and was
          overflowing a box sized for "offer". */}
      <Node x={8} y={44} w={110} label="offer" />
      <Node x={8} y={102} w={110} label="acceptance" />
      <Node x={8} y={160} w={110} label="consideration" />
      <Node x={196} y={44} w={92} label="agreement" />
      <Node x={196} y={102} w={92} label="intention" />
      <Node x={196} y={160} w={92} label="capacity" />
      <Node x={326} y={102} w={86} label="contract" strong />
    </svg>
  );
}

function Node({
  x,
  y,
  w,
  label,
  strong = false,
}: {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly label: string;
  readonly strong?: boolean;
}) {
  return (
    <g className="repsvg-node" data-strong={strong || undefined}>
      <rect x={x} y={y} width={w} height={32} rx={4} />
      <text x={x + w / 2} y={y + 21}>
        {label}
      </text>
    </g>
  );
}

/**
 * A rotating wireframe solid — the "spatial" case.
 *
 * Its own tiny WebGL context rather than a shared one. Sharing a renderer across
 * scattered canvases means either one full-page canvas positioned behind the
 * layout (which breaks the moment anything scrolls independently) or copying
 * frames between contexts. Two small contexts is the cheaper honest answer.
 */
function WireModel() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reduced =
      !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      setFailed(true);
      return;
    }
    host.appendChild(canvas);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearAlpha(0);

    const ink = new THREE.Color(getComputedStyle(host).color || "#000");
    const geometry = new THREE.IcosahedronGeometry(1.25, 2);
    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(geometry),
      new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.55 }),
    );
    const scene = new THREE.Scene();
    scene.add(wire);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.z = 4.2;

    const fit = () => {
      const r = host.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);

    let onScreen = true;
    const io = new IntersectionObserver((e) => {
      onScreen = e[0]?.isIntersecting ?? true;
    }, { rootMargin: "120px" });
    io.observe(host);

    // Drag to turn it. The claim in the copy is "you get to turn it over", and a
    // demo that only spins on its own does not support that claim.
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let velocity = reduced ? 0 : 0.0022;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      wire.rotation.y += (e.clientX - lastX) * 0.008;
      wire.rotation.x += (e.clientY - lastY) * 0.008;
      lastX = e.clientX;
      lastY = e.clientY;
      velocity = 0;
    };
    const onUp = () => {
      dragging = false;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.style.cursor = "grab";
    canvas.style.touchAction = "pan-y";

    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!onScreen) return;
      if (!dragging) {
        wire.rotation.y += velocity;
        wire.rotation.x += velocity * 0.35;
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      scene.remove(wire);
      wire.geometry.dispose();
      (wire.material as THREE.Material).dispose();
      geometry.dispose();
      renderer.forceContextLoss();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  if (failed) return <div className="repsvg repsvg-fallback">interactive 3D</div>;
  return <div ref={hostRef} className="reps-model" style={{ color: "var(--text)" }} />;
}

/** A plotted relationship — the "quantity behaves like this" case. */
function Plot() {
  return (
    <svg className="repsvg" viewBox="0 0 420 268" role="img" aria-label="Graph of a damped oscillation with its equation">
      <g className="repsvg-axis">
        <line x1="46" y1="132" x2="392" y2="132" />
        <line x1="46" y1="26" x2="46" y2="228" />
      </g>
      <path
        className="repsvg-curve"
        d="M46 132 C70 42 94 42 118 132 C142 210 166 210 190 132 C210 68 230 68 250 132 C266 186 282 186 298 132 C311 90 324 90 337 132 C347 166 357 166 367 132 L392 132"
      />
      <path className="repsvg-envelope" d="M46 34 C160 34 300 108 392 128" />
      <path className="repsvg-envelope" d="M46 230 C160 230 300 156 392 136" />
      {/* Below the lower envelope, not across it. The equation and the curve are
          two statements of the same thing and overlapping them made both harder
          to read than either alone. */}
      <text className="repsvg-eq" x="232" y="258">
        x(t) = A e
        <tspan dy="-6" fontSize="11">−ζωt</tspan>
        <tspan dy="6"> cos(ω</tspan>
        <tspan dy="3" fontSize="11">d</tspan>
        <tspan dy="-3">t + φ)</tspan>
      </text>
    </svg>
  );
}
