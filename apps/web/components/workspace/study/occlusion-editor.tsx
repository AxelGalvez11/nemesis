"use client";

import { IconPhoto, IconTrash } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Input } from "@/components/desktop-ui/input";
import { Textarea } from "@/components/desktop-ui/textarea";
import { useCloudStudy } from "@/lib/workspace/study-cloud-store";
import { suggestOcclusionMasks } from "@/lib/workspace/occlusion-suggest-api";
import {
  clampOcclusionShape,
  normalizeOcclusionRect,
  type OcclusionMode,
  type OcclusionPoint,
  type OcclusionShape,
} from "@nemesis/shared";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

interface LoadedImage {
  file: File | null;
  dataUrl: string;
  width: number;
  height: number;
}

type Gesture =
  | { kind: "draw"; start: OcclusionPoint }
  | { kind: "move"; id: string; dx: number; dy: number }
  | { kind: "resize"; id: string };

interface OcclusionEditorProps {
  deckId: string;
  /** Raw tags text from the dialog's shared Tags field. */
  tags: string;
  sourcePath: string | null;
  onCancel: () => void;
  onSaved: () => void;
}

/**
 * Anki-style image occlusion authoring: pick or paste an image, drag to draw
 * masks, then save — every mask becomes its own card in the chosen deck.
 */
export function OcclusionEditor({ deckId, tags, sourcePath, onCancel, onSaved }: OcclusionEditorProps) {
  const { createOcclusionCards } = useCloudStudy();
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [shapes, setShapes] = useState<OcclusionShape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<OcclusionMode>("hide-all");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  // Separate from `error`: "found 8, skipped 3" is a report on work that
  // SUCCEEDED, and showing it in the red slot reads as a failure.
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const gestureRef = useRef<Gesture | null>(null);

  const readFile = useCallback((file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Use a PNG, JPEG, WebP, or GIF image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Images can be up to 10 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const probe = new Image();
      probe.onload = () => {
        setImage({ file, dataUrl, width: probe.naturalWidth, height: probe.naturalHeight });
        setShapes([]);
        setSelectedId(null);
        setError(null);
      };
      probe.onerror = () => setError("Couldn't read that image.");
      probe.src = dataUrl;
    };
    reader.onerror = () => setError("Couldn't read that image.");
    reader.readAsDataURL(file);
  }, []);

  // Students screenshot slides — let them paste straight into the dialog.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith("image/"));
      if (file) {
        event.preventDefault();
        readFile(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [readFile]);

  function toImagePoint(event: React.PointerEvent): OcclusionPoint {
    const svg = svgRef.current;
    if (!svg || !image) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * image.width,
      y: ((event.clientY - rect.top) / rect.height) * image.height,
    };
  }

  function beginDraw(event: React.PointerEvent) {
    if (!image) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = { kind: "draw", start: toImagePoint(event) };
    setSelectedId(null);
  }

  function beginMove(event: React.PointerEvent, shape: OcclusionShape) {
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    const point = toImagePoint(event);
    gestureRef.current = { kind: "move", id: shape.id, dx: point.x - shape.x, dy: point.y - shape.y };
    setSelectedId(shape.id);
  }

  function beginResize(event: React.PointerEvent, shape: OcclusionShape) {
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    gestureRef.current = { kind: "resize", id: shape.id };
    setSelectedId(shape.id);
  }

  function onPointerMove(event: React.PointerEvent) {
    const gesture = gestureRef.current;
    if (!gesture || !image) return;
    const point = toImagePoint(event);
    if (gesture.kind === "draw") {
      setDraft({
        x: Math.min(gesture.start.x, point.x),
        y: Math.min(gesture.start.y, point.y),
        w: Math.abs(point.x - gesture.start.x),
        h: Math.abs(point.y - gesture.start.y),
      });
      return;
    }
    setShapes((current) =>
      current.map((shape) => {
        if (shape.id !== gesture.id) return shape;
        const next =
          gesture.kind === "move"
            ? { ...shape, x: point.x - gesture.dx, y: point.y - gesture.dy }
            : { ...shape, w: point.x - shape.x, h: point.y - shape.y };
        return clampOcclusionShape(next, image.width, image.height);
      }),
    );
  }

  function onPointerUp(event: React.PointerEvent) {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    setDraft(null);
    if (!gesture || !image || gesture.kind !== "draw") return;
    const rect = normalizeOcclusionRect(gesture.start, toImagePoint(event), image.width, image.height);
    if (!rect) return;
    const shape: OcclusionShape = { id: crypto.randomUUID(), ...rect, label: "" };
    setShapes((current) => [...current, shape]);
    setSelectedId(shape.id);
  }

  /** Let the reader find the labelled parts, then hand them over to be adjusted.
   *
   *  🔴 THIS PROPOSES, IT DOES NOT DECIDE. Suggested boxes land in the same
   *  `shapes` state a drag would have produced, so each can be moved, relabelled
   *  or deleted, and Save stays a separate deliberate click. A reading that saved
   *  itself would be a deck nobody looked at, which is worse than no deck.
   *
   *  Boxes already drawn are kept — asking for help must not delete your work. */
  const suggest = useCallback(async () => {
    if (!image?.file || suggesting) return;
    setSuggesting(true);
    setError(null);
    setNotice(null);
    try {
      const found = await suggestOcclusionMasks(
        image.file,
        image.width,
        image.height,
        () => crypto.randomUUID(),
      );
      if (found.shapes.length === 0) {
        setNotice(found.note || "Nothing to hide was found in that image.");
      } else {
        setShapes((current) => [...current, ...found.shapes]);
        const added = `Added ${found.shapes.length} box${found.shapes.length === 1 ? "" : "es"}. Adjust or delete any, then save.`;
        // Never silent about what was dropped — quiet truncation reads as
        // "it found everything".
        setNotice(found.note ? `${added} ${found.note}` : added);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't read that image.");
    } finally {
      setSuggesting(false);
    }
  }, [image, suggesting]);

  function setLabel(id: string, label: string) {
    setShapes((current) => current.map((shape) => (shape.id === id ? { ...shape, label } : shape)));
  }

  function removeShape(id: string) {
    setShapes((current) => current.filter((shape) => shape.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  }

  async function save() {
    if (!image || saving) return;
    if (!deckId) {
      setError("Choose a deck first.");
      return;
    }
    if (shapes.length === 0) {
      setError("Draw at least one mask over the image.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createOcclusionCards({
        deckId,
        file: image.file,
        dataUrl: image.dataUrl,
        width: image.width,
        height: image.height,
        mode,
        shapes,
        notes,
        tags: tags.split(/[\s,]+/),
        sourcePath,
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't create the cards.");
    } finally {
      setSaving(false);
    }
  }

  const unit = image ? Math.max(1, Math.min(image.width, image.height) / 300) : 1;
  return (
    <div
      className="grid gap-4"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/"));
        if (file) readFile(file);
      }}
    >
      <input
        accept={ACCEPTED_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) readFile(file);
          event.target.value = "";
        }}
        ref={fileRef}
        type="file"
      />
      {!image ? (
        <button
          className="grid place-items-center gap-2 rounded-xl border border-dashed border-(--ui-stroke-secondary) bg-(--ui-bg-tertiary) px-6 py-12 text-center transition-colors hover:border-(--ui-stroke-primary)"
          onClick={() => fileRef.current?.click()}
          type="button"
        >
          <IconPhoto className="size-6 text-(--ui-text-tertiary)" />
          <span className="text-sm font-medium">Choose an image</span>
          <span className="text-xs text-muted-foreground">or drop a file here, or paste a screenshot</span>
        </button>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div aria-label="Occlusion mode" className="flex items-center gap-0.5 rounded-lg border border-(--ui-stroke-tertiary) p-0.5" role="group">
              <Button
                aria-pressed={mode === "hide-all"}
                className="h-6 px-2 text-xs"
                onClick={() => setMode("hide-all")}
                title="Every mask stays covered; you guess the highlighted one"
                type="button"
                variant={mode === "hide-all" ? "secondary" : "ghost"}
              >
                Hide all
              </Button>
              <Button
                aria-pressed={mode === "hide-one"}
                className="h-6 px-2 text-xs"
                onClick={() => setMode("hide-one")}
                title="Only the tested mask is covered; the rest stay visible"
                type="button"
                variant={mode === "hide-one" ? "secondary" : "ghost"}
              >
                Hide one
              </Button>
            </div>
            <span className="flex-1" />
            <Button className="text-xs" onClick={() => fileRef.current?.click()} size="sm" type="button" variant="ghost">
              Replace image
            </Button>
          </div>
          <svg
            className="block w-full cursor-crosshair touch-none select-none rounded-xl border border-(--ui-stroke-secondary) bg-white"
            onPointerDown={beginDraw}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            ref={svgRef}
            viewBox={`0 0 ${image.width} ${image.height}`}
          >
            <image height={image.height} href={image.dataUrl} width={image.width} />
            {shapes.map((shape, index) => {
              const selected = shape.id === selectedId;
              return (
                <g key={shape.id}>
                  <rect
                    className="cursor-move"
                    fill="#52525b"
                    fillOpacity={0.92}
                    height={shape.h}
                    onPointerDown={(event) => beginMove(event, shape)}
                    rx={4 * unit}
                    stroke={selected ? "hsl(var(--destructive))" : "#3f3f46"}
                    strokeWidth={(selected ? 2.5 : 1.25) * unit}
                    width={shape.w}
                    x={shape.x}
                    y={shape.y}
                  />
                  <text
                    dominantBaseline="central"
                    fill="#fafafa"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontSize={13 * unit}
                    fontWeight={600}
                    style={{ pointerEvents: "none" }}
                    textAnchor="middle"
                    x={shape.x + shape.w / 2}
                    y={shape.y + shape.h / 2}
                  >
                    {index + 1}
                  </text>
                  {selected && (
                    <rect
                      className="cursor-nwse-resize"
                      fill="hsl(var(--destructive))"
                      height={9 * unit}
                      onPointerDown={(event) => beginResize(event, shape)}
                      rx={2 * unit}
                      width={9 * unit}
                      x={shape.x + shape.w - 4.5 * unit}
                      y={shape.y + shape.h - 4.5 * unit}
                    />
                  )}
                </g>
              );
            })}
            {draft && (
              <rect
                fill="hsl(var(--destructive) / 0.15)"
                height={draft.h}
                stroke="hsl(var(--destructive))"
                strokeDasharray={`${5 * unit} ${4 * unit}`}
                strokeWidth={1.5 * unit}
                width={draft.w}
                x={draft.x}
                y={draft.y}
              />
            )}
          </svg>
          <p className="text-[0.6875rem] text-muted-foreground">
            Drag on the image to add a mask. Click a mask to label it, move it, or resize it from the corner handle.
          </p>
          {shapes.length > 0 && (
            <div className="grid gap-1.5">
              {shapes.map((shape, index) => (
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-lg border border-(--ui-stroke-tertiary) px-2 py-1.5",
                    shape.id === selectedId && "border-(--ui-stroke-primary) bg-black/[0.03] dark:bg-white/[0.05]",
                  )}
                  key={shape.id}
                >
                  <span className="grid size-5 shrink-0 place-items-center rounded-md bg-(--ui-bg-tertiary) text-[0.625rem] font-semibold tabular-nums">
                    {index + 1}
                  </span>
                  <Input
                    className="h-7 flex-1 border-0 bg-transparent px-1 text-xs shadow-none"
                    onChange={(event) => setLabel(shape.id, event.target.value)}
                    onFocus={() => setSelectedId(shape.id)}
                    placeholder={`Label (optional) — becomes the card name, e.g. "Mask ${index + 1}"`}
                    value={shape.label}
                  />
                  <Button
                    aria-label={`Delete mask ${index + 1}`}
                    onClick={() => removeShape(shape.id)}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <IconTrash />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <label className="grid gap-1.5 text-xs font-medium">
            Notes <span className="font-normal text-muted-foreground">optional — shown after you reveal the answer</span>
            <Textarea className="min-h-16" onChange={(event) => setNotes(event.target.value)} placeholder="Extra context for these cards" value={notes} />
          </label>
        </>
      )}
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</p>}
      {notice && <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground" data-testid="occlusion-notice">{notice}</p>}
      <div className="flex items-center justify-end gap-2">
        {image && shapes.length > 0 && (
          <span className="mr-auto text-xs text-muted-foreground">
            {shapes.length === 1 ? "1 card will be created" : `${shapes.length} cards will be created`}
          </span>
        )}
        <Button
          disabled={!image?.file || suggesting}
          onClick={() => void suggest()}
          type="button"
          variant="ghost"
        >
          {suggesting ? "Reading…" : "Suggest boxes"}
        </Button>
        <Button onClick={onCancel} type="button" variant="ghost">Cancel</Button>
        <Button disabled={saving || !image || shapes.length === 0} onClick={() => void save()} type="button" variant="secondary">
          {saving ? "Saving…" : shapes.length > 1 ? `Add ${shapes.length} cards` : "Add card"}
        </Button>
      </div>
    </div>
  );
}
