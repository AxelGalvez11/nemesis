import * as THREE from "three";

import { uniformOf } from "./shader-common";
import type { Candidate, Params } from "./types";

/**
 * The lab's renderer plumbing.
 *
 * ONE clock and ONE requestAnimationFrame driver for every live view. That is
 * not a micro-optimisation — it is the only way "compare B and D side by side"
 * means anything. Two views each running their own rAF would be a fraction of a
 * second out of step within a minute, and the owner would be judging a phase
 * offset rather than a technique.
 */

// ---------------------------------------------------------------------------
// Shared clock
// ---------------------------------------------------------------------------

let epoch = typeof performance === "undefined" ? 0 : performance.now();
let paused = false;
let pausedAt = epoch;
/** Total milliseconds spent paused, so unpausing resumes rather than jumps. */
let pausedTotal = 0;

const now = () => (typeof performance === "undefined" ? 0 : performance.now());

/** Seconds since the shared epoch, frozen while paused. */
export function labTime(): number {
  const t = paused ? pausedAt : now();
  return (t - epoch - pausedTotal) / 1000;
}

export function setPaused(next: boolean): void {
  if (next === paused) return;
  if (next) pausedAt = now();
  else pausedTotal += now() - pausedAt;
  paused = next;
}

export function isPaused(): boolean {
  return paused;
}

/**
 * Restarts the SHARED epoch, which is what makes "sync" in compare mode real.
 * Resetting per-view clocks would leave the views exactly as desynchronised as
 * they were, while appearing to have done something.
 */
export function resetClock(): void {
  epoch = now();
  pausedTotal = 0;
  if (paused) pausedAt = epoch;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export type Metrics = {
  readonly drawCalls: number;
  readonly visible: number;
  readonly allocated: number;
  /** three.js's own frame counter. If this is not climbing, the view is dead. */
  readonly frame: number;
  readonly lost: boolean;
};

export type ViewHandle = {
  setParams: (p: Params) => void;
  setInk: (hex: string) => void;
  metrics: () => Metrics;
  dispose: () => void;
};

/**
 * How hard a view is allowed to work.
 *
 * `preview` halves the frame rate and drops to one device pixel per CSS pixel.
 * The grid runs eight views at once and is a BROWSING surface — full quality
 * there costs roughly four times the fragment work for tiles 240px tall, and the
 * result was 9fps, which misrepresents every candidate equally. Inspect and
 * compare, where judgements are actually made, run at full quality.
 */
export type Quality = "full" | "preview";

type LiveView = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  instance: ReturnType<Candidate["build"]>;
  params: Params;
  canvas: HTMLCanvasElement;
  observer: ResizeObserver | null;
  stride: number;
  lost: boolean;
  onLost: (e: Event) => void;
};

const views = new Set<LiveView>();
let rafId: number | null = null;
let frameCounter = 0;

/** Lab-wide frame rate. One number, reported once, in the header. */
let labFrameMs = 0;
let lastTick = 0;

export function labFps(): number {
  return labFrameMs === 0 ? 0 : 1000 / labFrameMs;
}

function tick(): void {
  rafId = requestAnimationFrame(tick);

  const t = labTime();
  const wall = now();
  const delta = lastTick === 0 ? 16.7 : wall - lastTick;
  lastTick = wall;
  frameCounter += 1;

  // Exponential moving average — a raw per-frame number is unreadable, and a
  // long average hides the stutter that actually disqualifies a candidate.
  labFrameMs = labFrameMs === 0 ? delta : labFrameMs * 0.9 + delta * 0.1;

  for (const v of views) {
    if (v.lost) continue;
    if (frameCounter % v.stride !== 0) continue;

    const rot = v.params.rotation ?? 0.045;
    const obj = v.instance.object;
    // A slow nod on an unrelated period, so the object never reads as a turntable
    // even at higher rotation values. Asymmetry is part of the brief.
    obj.rotation.y = t * rot;
    obj.rotation.x = 0.19 + Math.sin(t * 0.13) * 0.06;

    v.camera.position.z = v.params.camDist ?? 5;
    v.camera.updateProjectionMatrix();

    v.instance.update(t, v.params);
    v.renderer.render(v.scene, v.camera);
  }
}

/**
 * Times ONE candidate with nothing else on the GPU.
 *
 * Timing views inside the live grid was tried first and had to be thrown away.
 * WebGL submission is asynchronous, so once the command queue saturates, the
 * stall lands on whichever view happens to submit next rather than on the view
 * that caused it — the same eight candidates produced 1.97ms for one and 210ms
 * for another whose shader does strictly less work. Those numbers were noise
 * wearing a decimal point.
 *
 * This instead renders each candidate alone, at a fixed size, and measures a
 * long batch of back-to-back frames ended by a `readPixels`.
 *
 * Two earlier attempts failed and are worth recording so they are not retried:
 * `gl.finish()` returns immediately on ANGLE/Metal rather than waiting, and
 * `performance.now()` is deliberately coarsened by the browser to around a tenth
 * of a millisecond. Between them, every candidate measured "0.00 ms". Batching
 * many frames puts the total well above the clock's resolution, and `readPixels`
 * is a genuinely synchronous stall — the CPU cannot get that pixel back until
 * the GPU has finished everything queued ahead of it.
 *
 * The absolute number is hardware-specific; the RANKING is what transfers.
 */
export async function benchmark(
  candidate: Candidate,
  params: Params,
  frames = 90,
  size = 420,
): Promise<number> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.z = params.camDist ?? 5;

  const instance = candidate.build();
  scene.add(instance.object);

  const material = (instance.object as THREE.Points).material as THREE.ShaderMaterial;
  uniformOf(material, "uPixelRatio").value = 1;

  const gl = renderer.getContext();
  const pixel = new Uint8Array(4);
  /** Blocks until the GPU has drained everything queued before it. */
  const drain = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  try {
    // Warm-up. The first frames pay for shader compilation and buffer upload,
    // which is real cost but not PER-FRAME cost, and including it would rank the
    // candidate with the biggest buffers slowest regardless of its shader.
    for (let i = 0; i < 6; i++) {
      instance.update(i * 0.1, params);
      renderer.render(scene, camera);
    }
    drain();

    const started = now();
    for (let i = 0; i < frames; i++) {
      instance.update(1 + i * 0.05, params);
      renderer.render(scene, camera);
    }
    drain();
    return (now() - started) / frames;
  } finally {
    scene.remove(instance.object);
    instance.dispose();
    renderer.forceContextLoss();
    renderer.dispose();
  }
}

function ensureDriver(): void {
  if (rafId === null) {
    lastTick = 0;
    rafId = requestAnimationFrame(tick);
  }
}

function stopDriverIfIdle(): void {
  if (views.size === 0 && rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function fit(v: LiveView): void {
  const rect = v.canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  v.renderer.setSize(w, h, false);
  v.camera.aspect = w / h;
  v.camera.updateProjectionMatrix();
}

export function createView(
  canvas: HTMLCanvasElement,
  candidate: Candidate,
  initial: Params,
  ink: string,
  quality: Quality = "full",
): ViewHandle {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: "high-performance",
  });
  const deviceRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio;
  const pixelRatio = quality === "preview" ? 1 : Math.min(deviceRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearAlpha(0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, initial.camDist ?? 5);

  const instance = candidate.build();
  scene.add(instance.object);

  const material = (instance.object as THREE.Points).material as THREE.ShaderMaterial;
  uniformOf(material, "uPixelRatio").value = pixelRatio;
  uniformOf(material, "uInk").value = new THREE.Color(ink);

  const view: LiveView = {
    renderer,
    scene,
    camera,
    instance,
    params: initial,
    canvas,
    observer: null,
    stride: quality === "preview" ? 2 : 1,
    lost: false,
    onLost: (e: Event) => {
      // A lost context never recovers on its own and silently renders nothing.
      // Flagging it is what stops the metrics panel reporting a confident 60fps
      // for a tile that is showing an empty rectangle.
      e.preventDefault();
      view.lost = true;
    },
  };

  canvas.addEventListener("webglcontextlost", view.onLost);

  fit(view);
  if (typeof ResizeObserver !== "undefined") {
    view.observer = new ResizeObserver(() => fit(view));
    view.observer.observe(canvas);
  }

  views.add(view);
  ensureDriver();

  return {
    setParams: (p) => {
      view.params = p;
    },
    setInk: (hex) => {
      uniformOf(material, "uInk").value = new THREE.Color(hex);
    },
    metrics: () => ({
      drawCalls: renderer.info.render.calls,
      visible: Math.round(instance.allocated * (view.params.density ?? 1)),
      allocated: instance.allocated,
      frame: renderer.info.render.frame,
      lost: view.lost,
    }),
    dispose: () => {
      views.delete(view);
      view.observer?.disconnect();
      canvas.removeEventListener("webglcontextlost", view.onLost);
      scene.remove(instance.object);
      instance.dispose();
      // Both calls, in this order. `dispose()` alone releases three.js's objects
      // but leaves the browser holding the WebGL context until GC runs, and the
      // context budget is roughly 16 — enough that a grid-to-inspect transition
      // can quietly exhaust it and leave a tile permanently blank.
      renderer.forceContextLoss();
      renderer.dispose();
      stopDriverIfIdle();
    },
  };
}
