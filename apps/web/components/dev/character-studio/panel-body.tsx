"use client";

// Body — the silhouette, the ink, and how much the character insists on being itself.

import { SHAPE_LABEL, SHAPE_ORDER } from "@/lib/mascot/shapes";
import type { ShapeId } from "@/lib/mascot/shapes";
import { DEFAULT_BODY, LIMITS, type StudioBody, type StudioCharacter } from "@/lib/studio/document";

import { Button, Chips, ColourField, Field, Section, Segmented, Slider } from "./bits";

const SHAPE_OPTIONS = SHAPE_ORDER.map((id) => ({ value: id, label: SHAPE_LABEL[id] }));

const SHAPE_NOTE: Record<ShapeId, string> = {
  blob: "Rest. Round-cornered with real sides — neither a ball nor an oval.",
  circle: "A plain ball. Not this character's own form — it is here for the bloub reference, whose resting body is exactly this.",
  triangle: "Point up, corners softened enough to survive 18px. The reference's playful state.",
  pebble: "Organic and slightly irregular. Reads as a made thing rather than a generated one.",
  crystal: "Resolved. The most decided the character ever looks.",
  lens: "Flattened with pointed ends — a thing for looking through. Reading, close inspection.",
  drop: "Fuller at the bottom. Leaning in, and a held question.",
  column: "Tall and narrow. Sitting up, alert, taking notice.",
  slab: "Wide and low. Settled onto its own weight — waiting, resting.",
  bloom: "Five soft lobes. Something happening inside it.",
};

export function BodyPanel({
  character,
  onChange,
}: {
  character: StudioCharacter;
  onChange: (next: StudioCharacter) => void;
}) {
  const body = character.body;
  const write = (patch: Partial<StudioBody>) => onChange({ ...character, body: { ...body, ...patch } });

  const untouched =
    body.scale === 1 &&
    body.stretch === 1 &&
    body.squash === 1 &&
    body.tilt === 0 &&
    body.taper === 0 &&
    body.pinch === 0 &&
    body.ripple === 0;

  return (
    <>
      <Section title="Silhouette" note="The outline the character wears, and how far it insists on it.">
        <Field label="Shape">
          <Chips value={body.shape} options={SHAPE_OPTIONS} onChange={(shape) => write({ shape })} />
        </Field>
        <p className="cs-hint">{SHAPE_NOTE[body.shape]}</p>

        <Slider
          label="Insistence"
          value={body.shapeMix}
          range={LIMITS.shapeMix}
          onChange={(shapeMix) => write({ shapeMix })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <p className="cs-dial-note">
          At 0% the state drives the outline — thinking gathers, insight resolves into a crystal. At
          100% the character always looks like itself and those changes stop showing. In between is
          recognisably one character that is still visibly working.
        </p>
      </Section>

      <Section
        title="Proportion"
        note="Multipliers and offsets on the pose each state produces."
        actions={
          <Button onClick={() => write({ ...DEFAULT_BODY, shape: body.shape, shapeMix: body.shapeMix })} disabled={untouched}>
            Reset
          </Button>
        }
      >
        <Slider label="Scale" value={body.scale} range={LIMITS.scale} onChange={(scale) => write({ scale })} />
        <Slider label="Width" value={body.stretch} range={LIMITS.stretch} onChange={(stretch) => write({ stretch })} />
        <Slider label="Height" value={body.squash} range={LIMITS.squash} onChange={(squash) => write({ squash })} />
        <Slider
          label="Tilt"
          value={body.tilt}
          range={LIMITS.bodyTilt}
          onChange={(tilt) => write({ tilt })}
          format={(v) => `${v}°`}
        />
      </Section>

      <Section
        title="Eyes"
        note="What the eyes are cut as. This is identity, so it belongs to the character rather than to any one face."
      >
        <Field label="Shape">
          <Segmented
            value={character.eyeShape}
            options={[
              { value: "blob" as const, label: "Own silhouette" },
              { value: "capsule" as const, label: "Capsule" },
            ]}
            onChange={(eyeShape) => onChange({ ...character, eyeShape })}
            ariaLabel="Eye shape"
          />
        </Field>
        <p className="cs-dial-note">
          {character.eyeShape === "blob"
            ? "The body's own outline at a much smaller scale, stood upright. One shape, two sizes — this is what makes Nemesis Nemesis."
            : "A stadium: straight sides, exactly semicircular ends. This is the bloub reference's eye, and it is fuller-cornered than ours at the same size."}
        </p>
      </Section>

      <Section title="Outline" note="What separates this from a mascot that only ever moves.">
        <div className="cs-dial">
          <Slider label="Taper" value={body.taper} range={LIMITS.taper} onChange={(taper) => write({ taper })} />
          <p className="cs-dial-note">Moves mass toward one side. A blob with no taper is a logo, not a creature.</p>
        </div>
        <div className="cs-dial">
          <Slider label="Waist" value={body.pinch} range={LIMITS.pinch} onChange={(pinch) => write({ pinch })} />
          <p className="cs-dial-note">A gather across the middle — the form pulling itself in.</p>
        </div>
        <div className="cs-dial">
          <Slider label="Ripple" value={body.ripple} range={LIMITS.ripple} onChange={(ripple) => write({ ripple })} />
          <p className="cs-dial-note">A three-lobe wave on the outline. Reads as internal activity.</p>
        </div>
      </Section>

      <Section
        title="Ink"
        note="Two colours and no third. The eye is the ground the character stands on, which is what makes the eyes read as cut out of the form."
      >
        <div className="cs-two">
          <ColourField label="Body · light" value={character.ink} onChange={(ink) => onChange({ ...character, ink })} />
          <ColourField label="Eye · light" value={character.eye} onChange={(eye) => onChange({ ...character, eye })} />
        </div>
        <div className="cs-two">
          <ColourField
            label="Body · dark"
            value={character.inkDark}
            onChange={(inkDark) => onChange({ ...character, inkDark })}
          />
          <ColourField
            label="Eye · dark"
            value={character.eyeDark}
            onChange={(eyeDark) => onChange({ ...character, eyeDark })}
          />
        </div>
        <p className="cs-hint">
          The shipped character inverts rather than tinting — near-black on paper, near-white on
          black — so it carries the same weight in both themes. Switch the studio's theme in the top
          bar to check yours does too.
        </p>
      </Section>
    </>
  );
}
