"use client";

// Faces — the panel the studio exists for.
//
// Six numbers make an expression in this engine, and all six are multipliers or offsets
// on whatever the state already decided. That is why this panel can be a column of
// sliders and still be the whole feature: there is no geometry to draw, no control points
// to place, no rig. Drag `curve` up and the eyes arch; that is warmth, and it is one
// number.
//
// 🔴 THE PREVIEW IS THE PRODUCT'S RENDERER, NOT A PREVIEW OF IT. Everything on this
// panel goes through `sampleState({ expressionDef })` — the same call the shipped mascot
// makes. There is no approximation step where a studio value becomes something else, so
// a face that looks right here cannot look different once it ships.

import { EXPRESSIONS, type ExpressionId } from "@/lib/mascot/expressions";
import { STATES, STATE_ORDER } from "@/lib/mascot/states";
import type { MascotMode } from "@/lib/mascot/types";
import {
  EYE_SIDE_IDENTITY,
  HEAD_FLAT,
  LIMITS,
  freshId,
  type EyeSide,
  type StudioCharacter,
  type StudioExpression,
} from "@/lib/studio/document";

import { Button, Chips, ColourField, Field, Section, Segmented, Slider, TextField } from "./bits";
import { Thumb } from "./thumb";

const MODE_OPTIONS = STATE_ORDER.map((id) => ({ value: id, label: STATES[id].label }));

/** The six, in the order an author reaches for them. */
const DIALS = [
  { key: "h", label: "Height", limit: "h", note: "Multiplies the state's eye height." },
  { key: "w", label: "Width", limit: "w", note: "Multiplies the state's eye width." },
  {
    key: "curve",
    label: "Arch",
    limit: "curve",
    note: "Up is pleased, down is concerned. The only thing this face has instead of a mouth.",
  },
  { key: "rise", label: "Rise", limit: "rise", note: "Negative sits the pair higher on the face." },
  { key: "tilt", label: "Tilt", limit: "tilt", note: "Positive leans the tops together." },
  { key: "asym", label: "Asymmetry", limit: "asym", note: "Sets one eye against the other." },
] as const;

export function FacesPanel({
  character,
  selectedId,
  onSelect,
  onChange,
  ink,
  eye,
}: {
  character: StudioCharacter;
  selectedId: string;
  onSelect: (id: string) => void;
  onChange: (next: StudioCharacter) => void;
  ink: string;
  eye: string;
}) {
  const faces = character.expressions;
  const face = faces.find((f) => f.id === selectedId) ?? faces[0]!;
  const head = face.head ?? HEAD_FLAT;
  const motion = face.motion ?? { eyes: "drift" as const, body: "breathe" as const };
  const linked = face.left == null && face.right == null;

  const write = (patch: Partial<StudioExpression>) => {
    onChange({
      ...character,
      expressions: faces.map((f) => (f.id === face.id ? { ...f, ...patch } : f)),
    });
  };

  const add = (from?: StudioExpression) => {
    const id = freshId("expr", faces.map((f) => f.id));
    const base: StudioExpression = from
      ? { ...from, id, name: `${from.name} copy` }
      : {
          id,
          name: "New face",
          h: 1,
          w: 1,
          rise: 0,
          tilt: 0,
          asym: 0,
          curve: 0,
          mode: face.mode,
          note: "",
        };
    onChange({ ...character, expressions: [...faces, base] });
    onSelect(id);
  };

  const remove = () => {
    // 🔴 THE LAST FACE CANNOT GO. Every other surface assumes a character has at least
    // one, and the repair pass would put the nine defaults back on the next load — which
    // reads as the studio undoing a deletion rather than as a rule.
    if (faces.length <= 1) return;
    const rest = faces.filter((f) => f.id !== face.id);
    onChange({
      ...character,
      expressions: rest,
      // A step pointing at a face that no longer exists is dropped rather than repointed.
      animations: character.animations.map((a) => ({
        ...a,
        steps: a.steps.filter((s) => s.expressionId !== face.id),
      })),
    });
    onSelect(rest[0]!.id);
  };

  /** Back to the shipped value, when this face has a counterpart in the engine. */
  const shipped = (EXPRESSIONS as Record<string, (typeof EXPRESSIONS)[ExpressionId] | undefined>)[face.id];
  const reset = () => {
    if (!shipped) return;
    write({ h: shipped.h, w: shipped.w, rise: shipped.rise, tilt: shipped.tilt, asym: shipped.asym, curve: shipped.curve });
  };

  const index = faces.findIndex((f) => f.id === face.id);
  /** Order is the order of the array, so reordering is a move within it. */
  const move = (by: number) => {
    const to = index + by;
    if (to < 0 || to >= faces.length) return;
    const next = [...faces];
    const [moved] = next.splice(index, 1);
    next.splice(to, 0, moved!);
    onChange({ ...character, expressions: next });
  };

  const used = character.animations
    .filter((a) => a.steps.some((s) => s.expressionId === face.id))
    .map((a) => a.name);

  return (
    <>
      <Section
        title="Faces"
        note={`${faces.length} in this character. Click one to edit it.`}
        actions={<Button onClick={() => add()}>New</Button>}
      >
        <div className="cs-face-grid">
          {faces.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`cs-face-card${f.id === face.id ? " is-on" : ""}`}
              onClick={() => onSelect(f.id)}
            >
              <Thumb character={character} expression={f} ink={ink} eye={eye} size={40} />
              <span className="cs-face-name">{f.name}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section
        title={face.name}
        note="Every dial multiplies or offsets what the state already decided. Nothing here is an absolute."
        actions={
          <>
            <Button onClick={() => move(-1)} disabled={index === 0} title="Move earlier">
              ↑
            </Button>
            <Button onClick={() => move(1)} disabled={index === faces.length - 1} title="Move later">
              ↓
            </Button>
            <Button onClick={() => add(face)}>Duplicate</Button>
            <Button onClick={remove} tone="danger" disabled={faces.length <= 1}>
              Delete
            </Button>
          </>
        }
      >
        <TextField label="Name" value={face.name} onChange={(name) => write({ name })} />
        <TextField
          label="Note"
          value={face.note}
          placeholder="What this face is for — becomes the doc comment on export."
          onChange={(note) => write({ note })}
        />

        <div className="cs-dials">
          {DIALS.map((d) => (
            <div key={d.key} className="cs-dial">
              <Slider
                label={d.label}
                value={face[d.key]}
                range={LIMITS[d.limit]}
                onChange={(v) => write({ [d.key]: v } as Partial<StudioExpression>)}
              />
              <p className="cs-dial-note">{d.note}</p>
            </div>
          ))}
        </div>

        {shipped ? (
          <div className="cs-row-end">
            <Button onClick={reset} title={`Back to the ${shipped.label} the product ships`}>
              Reset to shipped
            </Button>
          </div>
        ) : null}
      </Section>


      <Section
        title="Head"
        note="Turns the face on a sphere. The eyes move round it and narrow as they go, which is what reads as a solid thing rather than a sticker."
        actions={
          <Button
            onClick={() => write({ head: { ...HEAD_FLAT } })}
            disabled={head.yaw === 0 && head.pitch === 0 && head.roll === 0}
          >
            Face front
          </Button>
        }
      >
        <Slider
          label="Turn"
          value={head.yaw}
          range={LIMITS.headTurn}
          onChange={(yaw) => write({ head: { ...head, yaw } })}
          format={(v) => `${v}°`}
        />
        <Slider
          label="Nod"
          value={head.pitch}
          range={LIMITS.headTurn}
          onChange={(pitch) => write({ head: { ...head, pitch } })}
          format={(v) => `${v}°`}
        />
        <Slider
          label="Tip"
          value={head.roll}
          range={LIMITS.headRoll}
          onChange={(roll) => write({ head: { ...head, roll } })}
          format={(v) => `${v}°`}
        />
        <p className="cs-dial-note">
          All three at zero is the flat face, drawn exactly as it always was. A small turn with a
          little tip is the three-quarter view both reference characters rest in.
        </p>
      </Section>

      <Section
        title="Eyes, one at a time"
        note={linked ? "The pair is linked." : "The two eyes are set separately."}
        actions={
          <Button onClick={() => write(linked ? { left: { ...EYE_SIDE_IDENTITY }, right: { ...EYE_SIDE_IDENTITY } } : { left: null, right: null })}>
            {linked ? "Unlink" : "Link"}
          </Button>
        }
      >
        {linked ? (
          <p className="cs-hint">
            Both eyes follow the dials above. Asymmetry already makes the pair uneven in mirror,
            which is usually what you want — unlink only when one eye needs to do something the
            other genuinely is not, such as a wink where one is wider as well as shorter.
          </p>
        ) : (
          <>
            {(["left", "right"] as const).map((which) => {
              const side = face[which] ?? EYE_SIDE_IDENTITY;
              const put = (patch: Partial<EyeSide>) => write({ [which]: { ...side, ...patch } });
              return (
                <div key={which} className="cs-step">
                  <div className="cs-step-head">
                    <span className="cs-field-label">{which === "left" ? "Left eye" : "Right eye"}</span>
                  </div>
                  <div className="cs-two">
                    <Slider label="Width" value={side.w} range={LIMITS.sideW} onChange={(w) => put({ w })} />
                    <Slider label="Height" value={side.h} range={LIMITS.sideH} onChange={(h) => put({ h })} />
                  </div>
                  <div className="cs-two">
                    <Slider label="Rise" value={side.rise} range={LIMITS.rise} onChange={(rise) => put({ rise })} />
                    <Slider
                      label="Tilt"
                      value={side.tilt}
                      range={LIMITS.tilt}
                      onChange={(tilt) => put({ tilt })}
                      format={(v) => `${v}°`}
                    />
                  </div>
                </div>
              );
            })}
            <p className="cs-dial-note">
              Multipliers and offsets on the pair, not replacements — so the state still decides how
              open the eyes are and this only says how far one of them departs.
            </p>
          </>
        )}
      </Section>

      <Section title="Movement" note="Ambient life while this face is held.">
        <div className="cs-two">
          <Field label="Eyes">
            <Segmented
              value={motion.eyes}
              options={[
                { value: "still" as const, label: "Still" },
                { value: "drift" as const, label: "Drift" },
                { value: "restless" as const, label: "Restless" },
              ]}
              onChange={(eyes) => write({ motion: { ...motion, eyes } })}
              ariaLabel="Eye movement"
            />
          </Field>
          <Field label="Body">
            <Segmented
              value={motion.body}
              options={[
                { value: "still" as const, label: "Still" },
                { value: "breathe" as const, label: "Breathe" },
                { value: "restless" as const, label: "Restless" },
              ]}
              onChange={(body) => write({ motion: { ...motion, body } })}
              ariaLabel="Body movement"
            />
          </Field>
        </div>
        <p className="cs-dial-note">
          Named settings rather than sliders, because amplitude and frequency mostly produce jitter —
          every value is reachable and almost none of them are good. Still means still: no blink, no
          drift, which is a stare and is occasionally exactly right.
        </p>
      </Section>

      <Section
        title="Colour, just for this face"
        note="Left alone, the face uses the character's own ink."
        actions={
          <Button onClick={() => write({ ink: null, eyeInk: null })} disabled={face.ink === null && face.eyeInk === null}>
            Clear
          </Button>
        }
      >
        <div className="cs-two">
          <ColourField
            label="Body"
            value={face.ink ?? character.ink}
            onChange={(ink) => write({ ink })}
          />
          <ColourField
            label="Eyes"
            value={face.eyeInk ?? character.eye}
            onChange={(eyeInk) => write({ eyeInk })}
          />
        </div>
        <p className="cs-dial-note">
          One colour for both themes: a face that flashes red flashes red on paper and on black
          alike, and a second value nobody looks at is a second value that ends up wrong.
        </p>
      </Section>

      <Section
        title="Previewed over"
        note="Which state's body this face is judged against. The exported face still works with all 27."
      >
        <Field label="State">
          <Chips
            value={face.mode}
            options={MODE_OPTIONS}
            onChange={(mode) => write({ mode: mode as MascotMode })}
          />
        </Field>
        <p className="cs-hint">{STATES[face.mode].note}</p>
        {used.length > 0 ? (
          <p className="cs-hint">
            Used by {used.length === 1 ? "the animation" : "animations"} {used.join(", ")}.
          </p>
        ) : null}
      </Section>
    </>
  );
}
