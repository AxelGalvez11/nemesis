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
  LIMITS,
  freshId,
  type StudioCharacter,
  type StudioExpression,
} from "@/lib/studio/document";

import { Button, Chips, Field, Section, Slider, TextField } from "./bits";
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
