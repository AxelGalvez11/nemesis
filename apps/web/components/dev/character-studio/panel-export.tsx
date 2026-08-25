"use client";

// Export — four ways out, for different people.
//
// 🔴 THE TYPESCRIPT BLOCK IS THE ONE THAT MATTERS. Everything else here is convenience;
// that one is what makes the studio load-bearing rather than a toy. A face authored on
// the Faces panel becomes a face the product ships by pasting one block, with nobody
// retyping six floats and getting the fourth one wrong.

import { useRef, useState } from "react";

import {
  characterToJson,
  docToJson,
  download,
  downloadText,
  expressionsToTypeScript,
  slug,
  svgMarkup,
  svgToPng,
} from "@/lib/studio/export";
import { normaliseDoc, type StudioCharacter, type StudioDoc } from "@/lib/studio/document";

import { Button, Field, Section, Segmented } from "./bits";

const SIZES = [
  { value: "512", label: "512" },
  { value: "1024", label: "1024" },
  { value: "2048", label: "2048" },
] as const;

export function ExportPanel({
  doc,
  character,
  stageSvg,
  onReplaceDoc,
  onNotice,
}: {
  doc: StudioDoc;
  character: StudioCharacter;
  /** The live node on the stage. Serialised as-is; see `svgMarkup`. */
  stageSvg: () => SVGSVGElement | null;
  onReplaceDoc: (next: StudioDoc) => void;
  onNotice: (message: string) => void;
}) {
  const [width, setWidth] = useState<(typeof SIZES)[number]["value"]>("1024");
  const [transparent, setTransparent] = useState<"yes" | "no">("yes");
  const fileInput = useRef<HTMLInputElement | null>(null);

  const ts = expressionsToTypeScript(character);

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotice(`${what} copied.`);
    } catch {
      // Clipboard access is refused on an insecure origin and in some embedded views.
      // Saying so beats a button that silently does nothing.
      onNotice("This browser would not give the studio the clipboard. Use Download instead.");
    }
  };

  const picture = async (kind: "svg" | "png") => {
    const node = stageSvg();
    if (!node) {
      onNotice("The stage is not ready yet.");
      return;
    }
    const markup = svgMarkup(node);
    const name = slug(character.name);
    if (kind === "svg") {
      downloadText(markup, `${name}.svg`, "image/svg+xml");
      onNotice("SVG saved.");
      return;
    }
    try {
      const blob = await svgToPng(markup, {
        width: Number(width),
        background: transparent === "yes" ? null : "#ffffff",
      });
      download(blob, `${name}-${width}.png`);
      onNotice("PNG saved.");
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "The picture could not be made.");
    }
  };

  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      // Repaired rather than trusted — this file may have been hand-edited, or written by
      // an older studio. `normaliseDoc` never throws and never returns an empty document.
      onReplaceDoc(normaliseDoc(JSON.parse(text)));
      onNotice("Project loaded.");
    } catch {
      onNotice("That file is not a studio project.");
    }
  };

  return (
    <>
      <Section
        title="Into the product"
        note="Paste over the EXPRESSIONS body in lib/mascot/expressions.ts. This is how a face here becomes a face the product ships."
        actions={<Button onClick={() => copy(ts, "TypeScript")} tone="primary">Copy</Button>}
      >
        <pre className="cs-code">{ts}</pre>
        <div className="cs-row-end">
          <Button onClick={() => downloadText(ts, `${slug(character.name)}-expressions.ts`, "text/plain")}>
            Download .ts
          </Button>
        </div>
      </Section>

      <Section title="Picture" note="Exactly the frame on the stage right now.">
        <Field label="PNG width">
          <Segmented value={width} options={SIZES} onChange={setWidth} ariaLabel="PNG width" />
        </Field>
        <Field label="Background">
          <Segmented
            value={transparent}
            options={[
              { value: "yes", label: "Transparent" },
              { value: "no", label: "White" },
            ]}
            onChange={setTransparent}
            ariaLabel="Background"
          />
        </Field>
        <div className="cs-row-end">
          <Button onClick={() => picture("svg")}>Save SVG</Button>
          <Button onClick={() => picture("png")}>Save PNG</Button>
        </div>
      </Section>

      <Section title="This character" note="One character, as JSON.">
        <div className="cs-row-end">
          <Button onClick={() => copy(characterToJson(character), "Character")}>Copy</Button>
          <Button
            onClick={() =>
              downloadText(characterToJson(character), `${slug(character.name)}.character.json`, "application/json")
            }
          >
            Download
          </Button>
        </div>
      </Section>

      <Section
        title="Whole project"
        note="Every character, face and animation. Back this up before clearing browser data — the studio saves in this browser and nowhere else."
      >
        <div className="cs-row-end">
          <Button
            onClick={() => downloadText(docToJson(doc), "nemesis-character-studio.json", "application/json")}
          >
            Download backup
          </Button>
          <Button onClick={() => fileInput.current?.click()}>Load backup…</Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="cs-hidden-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Cleared so choosing the same file twice in a row fires again.
            e.target.value = "";
            if (file) void importFile(file);
          }}
        />
        <p className="cs-hint">Loading a backup replaces everything currently in the studio.</p>
      </Section>
    </>
  );
}
