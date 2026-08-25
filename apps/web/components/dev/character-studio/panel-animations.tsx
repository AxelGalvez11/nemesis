"use client";

// Animations — faces on a timeline.
//
// 🔴 A STEP OWNS ITS ARRIVAL. The obvious model is a list of faces with gaps between
// them, and it makes the timeline lie: a bar the author sized to two seconds occupies
// two seconds plus whatever the next step's morph turns out to be, so the picture and
// the playback disagree. Here a step is `morph + hold` — it spends the first part
// arriving from its predecessor and the rest holding — and the bar widths are the truth.
//
// 🔴 BLINKING IS A SCHEDULE, NOT A STEP, and that is what stops an authored sequence
// reading as mechanical. A blink lands on top of whatever the face is doing, at an
// interval that is deliberately irregular, and it can land mid-morph.

import type { EaseName } from "@/lib/mascot/easing";
import {
  LIMITS,
  animationDuration,
  freshId,
  type BlinkPlan,
  type PlaybackMode,
  type StudioAnimation,
  type StudioCharacter,
  type StudioStep,
} from "@/lib/studio/document";

import { Button, Chips, Field, Section, Segmented, Slider, TextField } from "./bits";

const EASE_OPTIONS: readonly { value: EaseName; label: string }[] = [
  { value: "outQuint", label: "Decisive" },
  { value: "outSine", label: "Calm" },
  { value: "inOutSine", label: "Even" },
  { value: "inOutQuart", label: "Weighted" },
  { value: "snap", label: "Snap" },
  { value: "linear", label: "Flat" },
];

const PLAYBACK_OPTIONS: readonly { value: PlaybackMode; label: string }[] = [
  { value: "loop", label: "Loop" },
  { value: "once", label: "Once" },
  { value: "pingpong", label: "Back and forth" },
];

const DEFAULT_BLINK: BlinkPlan = { first: 2.1, min: 2.8, max: 5, dur: 0.26 };

const secs = (v: number) => `${v.toFixed(v < 1 ? 2 : 1)}s`;

export function AnimationsPanel({
  character,
  onChange,
  selectedId,
  onSelect,
  playingStep,
}: {
  character: StudioCharacter;
  onChange: (next: StudioCharacter) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Which step is on screen right now, so the timeline can show a playhead. */
  playingStep: number;
}) {
  const anims = character.animations;
  const anim = anims.find((a) => a.id === selectedId) ?? anims[0] ?? null;

  const writeAnim = (patch: Partial<StudioAnimation>) => {
    if (!anim) return;
    onChange({
      ...character,
      animations: anims.map((a) => (a.id === anim.id ? { ...a, ...patch } : a)),
    });
  };

  const addAnim = (from?: StudioAnimation) => {
    const id = freshId("anim", anims.map((a) => a.id));
    const first = character.expressions[0]!;
    const base: StudioAnimation = from
      ? { ...from, id, name: `${from.name} copy` }
      : {
          id,
          name: "New animation",
          steps: [{ expressionId: first.id, hold: 1.5, morph: 0.45, ease: "outQuint" }],
          playback: "loop",
          blink: DEFAULT_BLINK,
        };
    onChange({ ...character, animations: [...anims, base] });
    onSelect(id);
  };

  const removeAnim = () => {
    if (!anim) return;
    const rest = anims.filter((a) => a.id !== anim.id);
    onChange({ ...character, animations: rest });
    if (rest[0]) onSelect(rest[0].id);
  };

  const writeStep = (index: number, patch: Partial<StudioStep>) => {
    if (!anim) return;
    writeAnim({ steps: anim.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  };

  const addStep = () => {
    if (!anim) return;
    const last = anim.steps[anim.steps.length - 1];
    const face = character.expressions[0]!;
    writeAnim({
      steps: [
        ...anim.steps,
        { expressionId: last?.expressionId ?? face.id, hold: 1.5, morph: 0.45, ease: "outQuint" },
      ],
    });
  };

  const moveStep = (index: number, by: number) => {
    if (!anim) return;
    const to = index + by;
    if (to < 0 || to >= anim.steps.length) return;
    const steps = [...anim.steps];
    const [moved] = steps.splice(index, 1);
    steps.splice(to, 0, moved!);
    writeAnim({ steps });
  };

  const removeStep = (index: number) => {
    if (!anim) return;
    writeAnim({ steps: anim.steps.filter((_, i) => i !== index) });
  };

  if (!anim) {
    return (
      <Section title="Animations" note="None yet." actions={<Button onClick={() => addAnim()}>New</Button>}>
        <p className="cs-hint">An animation is a list of faces, each held for a while.</p>
      </Section>
    );
  }

  const total = animationDuration(anim);
  const faceOptions = character.expressions.map((e) => ({ value: e.id, label: e.name }));

  return (
    <>
      <Section
        title="Animations"
        note={`${anims.length} in this character.`}
        actions={<Button onClick={() => addAnim()}>New</Button>}
      >
        <div className="cs-chips">
          {anims.map((a) => (
            <button
              key={a.id}
              type="button"
              className={a.id === anim.id ? "is-on" : undefined}
              onClick={() => onSelect(a.id)}
            >
              {a.name}
            </button>
          ))}
        </div>
      </Section>

      <Section
        title={anim.name}
        note={`${anim.steps.length} ${anim.steps.length === 1 ? "step" : "steps"} · ${secs(total)} a pass`}
        actions={
          <>
            <Button onClick={() => addAnim(anim)}>Duplicate</Button>
            <Button onClick={removeAnim} tone="danger">
              Delete
            </Button>
          </>
        }
      >
        <TextField label="Name" value={anim.name} onChange={(name) => writeAnim({ name })} />
        <Field label="Playback">
          <Segmented
            value={anim.playback}
            options={PLAYBACK_OPTIONS}
            onChange={(playback) => writeAnim({ playback })}
            ariaLabel="Playback mode"
          />
        </Field>

        {/* The timeline. Bar widths are proportional to each step's real length, which is
            only honest because a step owns its own morph — see the note at the top. */}
        <div className="cs-timeline" aria-hidden="true">
          {anim.steps.map((s, i) => {
            const face = character.expressions.find((e) => e.id === s.expressionId);
            const len = s.morph + s.hold;
            const one = anim.steps.reduce((sum, x) => sum + x.morph + x.hold, 0);
            return (
              <div
                key={i}
                className={`cs-tl-step${i === playingStep ? " is-live" : ""}`}
                style={{ flexGrow: one > 0 ? len / one : 1 }}
              >
                <span className="cs-tl-morph" style={{ width: `${len > 0 ? (s.morph / len) * 100 : 0}%` }} />
                <span className="cs-tl-name">{face?.name ?? "—"}</span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Steps" note="Each step arrives, then holds." actions={<Button onClick={addStep}>Add step</Button>}>
        {anim.steps.map((s, i) => (
          <div key={i} className={`cs-step${i === playingStep ? " is-live" : ""}`}>
            <div className="cs-step-head">
              <span className="cs-step-index">{i + 1}</span>
              <Chips
                value={s.expressionId}
                options={faceOptions}
                onChange={(expressionId) => writeStep(i, { expressionId })}
              />
              <div className="cs-step-tools">
                <Button onClick={() => moveStep(i, -1)} disabled={i === 0} title="Move up">
                  ↑
                </Button>
                <Button onClick={() => moveStep(i, 1)} disabled={i === anim.steps.length - 1} title="Move down">
                  ↓
                </Button>
                <Button onClick={() => removeStep(i)} tone="danger" disabled={anim.steps.length <= 1} title="Remove">
                  ×
                </Button>
              </div>
            </div>
            <div className="cs-two">
              <Slider
                label="Arrive over"
                value={s.morph}
                range={LIMITS.morph}
                onChange={(morph) => writeStep(i, { morph })}
                format={secs}
              />
              <Slider
                label="Hold"
                value={s.hold}
                range={LIMITS.hold}
                onChange={(hold) => writeStep(i, { hold })}
                format={secs}
              />
            </div>
            <Field label="Arrival curve">
              <Chips value={s.ease} options={EASE_OPTIONS} onChange={(ease) => writeStep(i, { ease })} />
            </Field>
            <Field label="Blink across the change">
              <Segmented
                value={s.blinkIn ? "on" : "off"}
                options={[
                  { value: "off", label: "No" },
                  { value: "on", label: "Yes" },
                ]}
                onChange={(v) => writeStep(i, { blinkIn: v === "on" })}
                ariaLabel="Blink across the change"
              />
            </Field>
            <p className="cs-dial-note">
              The eye shuts over the arrival, centred on it, so the new shape reads as a decision
              rather than as a glitch. Worth it when the step changes the silhouette a long way.
            </p>
          </div>
        ))}
      </Section>

      <Section
        title="Blinking"
        note="Lands on top of whatever the face is doing."
        actions={
          <Button onClick={() => writeAnim({ blink: anim.blink ? null : DEFAULT_BLINK })}>
            {anim.blink ? "Turn off" : "Turn on"}
          </Button>
        }
      >
        {anim.blink ? (
          <>
            <Slider
              label="First blink"
              value={anim.blink.first}
              range={LIMITS.blinkFirst}
              onChange={(first) => writeAnim({ blink: { ...anim.blink!, first } })}
              format={secs}
            />
            <div className="cs-two">
              <Slider
                label="Gap · least"
                value={anim.blink.min}
                range={LIMITS.blinkGap}
                onChange={(min) =>
                  writeAnim({ blink: { ...anim.blink!, min, max: Math.max(min, anim.blink!.max) } })
                }
                format={secs}
              />
              <Slider
                label="Gap · most"
                value={anim.blink.max}
                range={LIMITS.blinkGap}
                onChange={(max) =>
                  writeAnim({ blink: { ...anim.blink!, max, min: Math.min(max, anim.blink!.min) } })
                }
                format={secs}
              />
            </div>
            <Slider
              label="Close and open"
              value={anim.blink.dur}
              range={LIMITS.blinkDur}
              onChange={(dur) => writeAnim({ blink: { ...anim.blink!, dur } })}
              format={(v) => `${Math.round(v * 1000)}ms`}
            />
            <p className="cs-hint">
              Each gap is drawn separately between least and most, so the rhythm never becomes a
              metronome. A real lid also closes faster than it opens, which the curve does for you.
            </p>
          </>
        ) : (
          <p className="cs-hint">This animation does not blink. A character that never blinks reads as switched off.</p>
        )}
      </Section>
    </>
  );
}
