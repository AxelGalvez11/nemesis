"use client";

// The character studio.
//
// A place to build the mascot's faces, bodies and animations by dragging things, and to
// get the result back out as code the product ships. It exists because the alternative —
// typing six floats into `expressions.ts` and reloading — is a loop slow enough that
// nobody iterates, and a character that nobody iterates on stays at its first draft.
//
// 🔴 ONE CLOCK, IN HERE. The stage, the filmstrip, the timeline playhead and the export
// all need the same instant; two `requestAnimationFrame` loops drift apart within
// seconds of the first scrub and the timeline starts lying about what is on screen. So
// the clock lives here, every surface below is handed a frame, and none of them animate.
//
// 🔴 AND THE CLOCK IS A VALUE, NOT AN ENGINE. `sampleAnimation(t)` and `studioFrame(t)`
// are both pure functions of time, so "play" is nothing more than advancing a number and
// "scrub" is setting it. That is what makes the scrubber work backwards, which is where
// most timing problems in an animation are actually visible.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTheme } from "@/components/theme-provider";
import { animationDuration, characterOf, type StudioCharacter, type StudioDoc } from "@/lib/studio/document";
import { animationFrame, expressionFrame, inkFor } from "@/lib/studio/frame";
import { loadDoc, saveDoc } from "@/lib/studio/storage";

import { Button, Segmented, Slider, Toast } from "./bits";
import { AnimationsPanel } from "./panel-animations";
import { BodyPanel } from "./panel-body";
import { CharactersPanel } from "./panel-characters";
import { ExportPanel } from "./panel-export";
import { FacesPanel } from "./panel-faces";
import { Stage } from "./stage";
import { Thumb } from "./thumb";

import "./character-studio.css";

type Tab = "characters" | "body" | "faces" | "animations" | "export";

const TABS: readonly { value: Tab; label: string }[] = [
  { value: "characters", label: "Characters" },
  { value: "body", label: "Body" },
  { value: "faces", label: "Faces" },
  { value: "animations", label: "Animations" },
  { value: "export", label: "Export" },
];

/** Seconds a held face runs before the clock wraps, so a long idle does not drift away. */
const HOLD_CYCLE = 60;

export function CharacterStudio() {
  // ── Document ────────────────────────────────────────────────────────────────
  //
  // Starts as a fresh document on both server and client, then adopts storage after
  // mount. Reading localStorage during render would make the server and the first client
  // render disagree, which React reports as a hydration error and repairs by throwing the
  // client's markup away — the studio would visibly flash the default character.
  const [doc, setDoc] = useState<StudioDoc | null>(null);
  useEffect(() => setDoc(loadDoc()), []);

  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const say = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2600);
  }, []);

  // Autosave, debounced. Every slider drag is dozens of document writes; writing each one
  // through `JSON.stringify` of the whole project is the one thing here that could make
  // dragging feel heavy.
  useEffect(() => {
    if (doc === null) return;
    const id = window.setTimeout(() => {
      if (!saveDoc(doc)) say("This browser will not let the studio save. Export a backup.");
    }, 400);
    return () => window.clearTimeout(id);
  }, [doc, say]);

  // ── What is being looked at ─────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>("faces");
  const [faceId, setFaceId] = useState<string | null>(null);
  const [animId, setAnimId] = useState<string | null>(null);
  /**
   * Whether the stage is holding one face or running a timeline.
   *
   * 🔴 THIS IS NOT THE CURRENT TAB, THOUGH IT LOOKS LIKE IT COULD BE. Deriving it from
   * the tab meant that starting an animation and then opening Export stopped the stage
   * showing it — while the clock kept running and the button still said Pause. What the
   * stage shows should follow what you last chose to look at, and then stay there while
   * you go and do something else.
   */
  const [stageMode, setStageMode] = useState<"face" | "animation">("face");
  const [playing, setPlaying] = useState(false);
  const [size, setSize] = useState(240);
  const [transparent, setTransparent] = useState(false);
  const [clock, setClock] = useState(0);
  const [gaze, setGaze] = useState<{ x: number; y: number } | null>(null);

  const { theme, setTheme } = useTheme();
  const dark = theme === "dark";

  // ── The clock ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); // A backgrounded tab returns a
      last = now; // huge delta; clamped so it does not jump the animation forward.
      setClock((t) => t + dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const stageSvg = useCallback(
    () => stageRef.current?.querySelector<SVGSVGElement>("svg") ?? null,
    [],
  );

  if (doc === null) {
    return <div className="cs cs-booting">Opening the studio…</div>;
  }

  const character = characterOf(doc);
  const faces = character.expressions;
  const face = faces.find((f) => f.id === faceId) ?? faces[0]!;
  const anim = character.animations.find((a) => a.id === animId) ?? character.animations[0] ?? null;
  const { ink, eye } = inkFor(character, dark);

  const writeCharacter = (next: StudioCharacter) => {
    setDoc({ ...doc, characters: doc.characters.map((c) => (c.id === next.id ? next : c)) });
  };

  // ── The frame everything on screen is showing ───────────────────────────────
  //
  // Two modes and one output. Playing samples the animation; otherwise a single face is
  // held, still living — it blinks and its gaze drifts, because a face judged perfectly
  // motionless is judged in a condition the product never shows it in.
  const onTimeline = anim !== null && stageMode === "animation";
  const played = onTimeline ? animationFrame(character, anim.id, clock, { look: gaze ? { ...gaze, mix: 1 } : undefined }) : null;
  const frame =
    played?.frame ??
    expressionFrame(character, face, clock % HOLD_CYCLE, {
      look: gaze ? { x: gaze.x, y: gaze.y, mix: 1 } : undefined,
    });

  const total = anim ? animationDuration(anim) : HOLD_CYCLE;
  const progress = total > 0 ? (clock % total) / total : 0;

  return (
    <div className="cs">
      <header className="cs-bar">
        <div className="cs-bar-left">
          <span className="cs-logo" aria-hidden="true" />
          <h1>Character studio</h1>
          <span className="cs-bar-note">Nemesis · saved in this browser</span>
        </div>
        <div className="cs-bar-right">
          <Segmented
            value={dark ? "dark" : "light"}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            onChange={(v) => setTheme(v as "light" | "dark")}
            ariaLabel="Theme"
          />
          <Segmented
            value={transparent ? "on" : "off"}
            options={[
              { value: "off", label: "Ground" },
              { value: "on", label: "Checker" },
            ]}
            onChange={(v) => setTransparent(v === "on")}
            ariaLabel="Stage background"
          />
        </div>
      </header>

      <div className="cs-body">
        <div className="cs-left">
          <Stage
            ref={stageRef}
            frame={frame}
            ink={ink}
            eye={eye}
            size={size}
            characterName={character.name}
            eyeShape={character.eyeShape}
            // 🔴 THE CHIP NAMES WHAT IS ON THE STAGE, not what is selected in a panel.
            // While a timeline is up, the stage shows the animation's current face — which
            // is not the face the Faces panel has selected, and naming that one made the
            // chip contradict the drawing directly under it.
            faceLabel={onTimeline ? (played?.sample.label ?? face.name) : face.name}
            playingLabel={onTimeline && playing ? (anim?.name ?? null) : null}
            transparent={transparent}
            onSnapshot={() => {
              setTab("export");
              say("Picture options are in Export.");
            }}
            onResetGaze={() => setGaze(null)}
          />

          <div className="cs-transport">
            <div className="cs-transport-row">
              <Button onClick={() => setPlaying((p) => !p)} tone="primary">
                {playing ? "Pause" : "Play"}
              </Button>
              <Button
                onClick={() => {
                  setPlaying(false);
                  setClock(0);
                }}
              >
                Stop
              </Button>
              <span className="cs-transport-time">
                {(onTimeline ? clock % total : clock % HOLD_CYCLE).toFixed(2)}s
                {onTimeline ? ` / ${total.toFixed(2)}s` : null}
              </span>
            </div>
            <input
              className="cs-scrubber"
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={progress}
              aria-label="Scrub"
              onChange={(e) => {
                setPlaying(false);
                setClock(Number(e.target.value) * total);
              }}
            />
            {/* One row, three sliders. Every row here is height the stage does not get,
                and the stage is the thing being looked at. */}
            <div className="cs-transport-row cs-gaze">
              <Slider label="Size" value={size} range={{ min: 24, max: 420, step: 1 }} onChange={setSize} format={(v) => `${v}px`} />
              <Slider
                label="Gaze ↔"
                value={gaze?.x ?? 0}
                range={{ min: -1, max: 1, step: 0.01 }}
                onChange={(x) => setGaze({ x, y: gaze?.y ?? 0 })}
              />
              <Slider
                label="Gaze ↕"
                value={gaze?.y ?? 0}
                range={{ min: -1, max: 1, step: 0.01 }}
                onChange={(y) => setGaze({ x: gaze?.x ?? 0, y })}
              />
            </div>
          </div>

          <div className="cs-strip" role="tablist" aria-label="Faces">
            {faces.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={f.id === face.id && !onTimeline}
                className={`cs-strip-item${f.id === face.id && !onTimeline ? " is-on" : ""}`}
                onClick={() => {
                  setFaceId(f.id);
                  setTab("faces");
                  setStageMode("face");
                }}
                title={f.name}
              >
                <Thumb character={character} expression={f} ink={ink} eye={eye} size={34} />
              </button>
            ))}
          </div>
        </div>

        <aside className="cs-right">
          <nav className="cs-tabs">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                className={t.value === tab ? "is-on" : undefined}
                aria-current={t.value === tab}
                onClick={() => {
                  setTab(t.value);
                  // Opening either of these two IS choosing what to look at. The other
                  // three are about the character rather than about a moment of it, so
                  // they leave the stage showing whatever it already was.
                  if (t.value === "animations") setStageMode("animation");
                  if (t.value === "faces") setStageMode("face");
                }}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="cs-panel">
            {tab === "characters" ? <CharactersPanel doc={doc} onChange={setDoc} dark={dark} /> : null}
            {tab === "body" ? <BodyPanel character={character} onChange={writeCharacter} /> : null}
            {tab === "faces" ? (
              <FacesPanel
                character={character}
                selectedId={face.id}
                onSelect={(id) => {
                  setFaceId(id);
                  setStageMode("face");
                }}
                onChange={writeCharacter}
                ink={ink}
                eye={eye}
              />
            ) : null}
            {tab === "animations" ? (
              <AnimationsPanel
                character={character}
                onChange={writeCharacter}
                selectedId={anim?.id ?? null}
                onSelect={(id) => {
                  setAnimId(id);
                  setStageMode("animation");
                }}
                playingStep={played?.sample.step ?? -1}
              />
            ) : null}
            {tab === "export" ? (
              <ExportPanel
                doc={doc}
                character={character}
                stageSvg={stageSvg}
                onReplaceDoc={setDoc}
                onNotice={say}
              />
            ) : null}
          </div>
        </aside>
      </div>

      <Toast message={notice} />
    </div>
  );
}
