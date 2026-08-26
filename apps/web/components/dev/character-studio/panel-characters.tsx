"use client";

// Characters — the gallery.

import {
  freshId,
  newCharacter,
  type StudioCharacter,
  type StudioDoc,
} from "@/lib/studio/document";

import { Button, Section, TextField } from "./bits";
import { Thumb } from "./thumb";

export function CharactersPanel({
  doc,
  onChange,
  dark,
}: {
  doc: StudioDoc;
  onChange: (next: StudioDoc) => void;
  dark: boolean;
}) {
  const current = doc.characters.find((c) => c.id === doc.selected) ?? doc.characters[0]!;

  const add = (from?: StudioCharacter) => {
    const id = freshId("char", doc.characters.map((c) => c.id));
    const made = from ? { ...from, id, name: `${from.name} copy` } : newCharacter("New character", id);
    onChange({ ...doc, characters: [...doc.characters, made], selected: id });
  };

  const remove = () => {
    // The document must always have one. `normaliseDoc` would put a default back, which
    // reads as the studio undoing a deletion rather than as a rule.
    if (doc.characters.length <= 1) return;
    const rest = doc.characters.filter((c) => c.id !== current.id);
    onChange({ ...doc, characters: rest, selected: rest[0]!.id });
  };

  const rename = (name: string) => {
    onChange({
      ...doc,
      characters: doc.characters.map((c) => (c.id === current.id ? { ...c, name } : c)),
    });
  };

  return (
    <>
      <Section
        title="Characters"
        note={`${doc.characters.length} in this studio. Everything is saved in this browser.`}
        actions={<Button onClick={() => add()}>New</Button>}
      >
        <div className="cs-face-grid">
          {doc.characters.map((c) => {
            // Each card shows the character's own first face, in its own ink — a gallery
            // that drew every character in the current one's colours would be useless.
            const face = c.expressions[0]!;
            return (
              <button
                key={c.id}
                type="button"
                className={`cs-face-card${c.id === current.id ? " is-on" : ""}`}
                onClick={() => onChange({ ...doc, selected: c.id })}
              >
                <Thumb
                  character={c}
                  expression={face}
                  ink={dark ? c.inkDark : c.ink}
                  eye={dark ? c.eyeDark : c.eye}
                  size={40}
                />
                <span className="cs-face-name">{c.name}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title={current.name}
        actions={
          <>
            <Button onClick={() => add(current)}>Duplicate</Button>
            <Button onClick={remove} tone="danger" disabled={doc.characters.length <= 1}>
              Delete
            </Button>
          </>
        }
      >
        <TextField label="Name" value={current.name} onChange={rename} />
        <p className="cs-hint">
          {current.expressions.length} {current.expressions.length === 1 ? "face" : "faces"} ·{" "}
          {current.animations.length} {current.animations.length === 1 ? "animation" : "animations"}
        </p>
      </Section>
    </>
  );
}
