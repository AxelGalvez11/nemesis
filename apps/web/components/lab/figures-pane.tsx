"use client";

// Every picture Nemesis believes exists — Nemesis Lab §3.
//
// 🔴 A PICTURE NOBODY LOOKED AT IS LISTED, LOUDLY. The owner's rule: "If Nemesis knows an image
// exists but did not inspect it, show that honestly. Do not silently omit it." So the list is built
// from the MODEL's figures — everything the parser located — and the description, the skip reason
// and the pixels are three separate facts about each one, any of which may be missing.
//
// Three states, and they are not the same:
//   described   vision looked and had something to say
//   skipped     something decided not to look, and named the reason
//   unexamined  nobody looked and nobody decided — the only one that is a gap in the pipeline

import type { DocBlock, DocumentModel } from "@nemesis/shared";

import type { LabFigureAsset } from "@/lib/lab/report";

export function FiguresPane({
  model,
  figures,
  onJump,
}: {
  model: DocumentModel | null;
  figures: readonly LabFigureAsset[];
  onJump: (unit: number) => void;
}) {
  if (!model) return <p className="p-4 text-sm text-neutral-500">This lane produced no structure, so it located no pictures.</p>;
  const blocks = model.blocks.filter((block) => block.figure);
  if (blocks.length === 0) {
    return (
      <p className="p-4 text-sm text-neutral-500">
        Nemesis located no pictures in this document. That is a claim about the parse, not proof the
        document has none.
      </p>
    );
  }
  const unexamined = blocks.filter((block) => !block.figure!.description && !block.figure!.skipped).length;
  return (
    <div className="p-3">
      <p className="mb-3 text-xs text-neutral-400">
        {blocks.length} picture(s) located.{" "}
        {unexamined > 0 ? (
          <span className="text-red-400">{unexamined} were never looked at and no reason was given.</span>
        ) : (
          "Every one was either examined or skipped for a stated reason."
        )}{" "}
        {figures.length > 0 ? `${figures.length} carried pixels through this parse.` : "None carried pixels through this parse."}
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {blocks.map((block) => (
          <FigureCard key={block.id} block={block} figures={figures} model={model} onJump={onJump} />
        ))}
      </div>
    </div>
  );
}

function FigureCard({
  block,
  figures,
  model,
  onJump,
}: {
  block: DocBlock;
  figures: readonly LabFigureAsset[];
  model: DocumentModel;
  onJump: (unit: number) => void;
}) {
  const figure = block.figure!;
  // The join key is the parser's own `ref` — the same string the normalizer records as `entry`.
  const asset = figure.ref ? figures.find((candidate) => candidate.entry === figure.ref) : undefined;
  const caption = model.blocks.find(
    (candidate) => candidate.kind === "caption" && candidate.unit === block.unit,
  );
  const unitKind = model.units[block.unit]?.kind ?? "unit";

  return (
    <div className="rounded border border-neutral-800 bg-neutral-900 p-2 text-xs">
      <div className="flex h-40 items-center justify-center overflow-hidden border border-neutral-800 bg-neutral-950">
        {asset?.dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.dataUrl} alt="" className="max-h-full max-w-full object-contain" />
        ) : figure.asset ? (
          <span className="px-3 text-center text-[11px] text-neutral-500">
            Extracted and stored, but its pixels did not travel to this page.
          </span>
        ) : (
          <span className="px-3 text-center text-[11px] text-neutral-500">
            No pixels were extracted for this picture. Nemesis knows it is there and cannot show it.
          </span>
        )}
      </div>
      <button type="button" onClick={() => onJump(block.unit)} className="mt-2 text-neutral-400 underline">
        {unitKind} {block.unit + 1}
      </button>
      <dl className="mt-1 space-y-0.5 text-[11px]">
        <Fact label="ref" value={figure.ref ?? "none"} />
        <Fact
          label="box"
          value={
            block.rect
              ? `${Math.round(block.rect.x)},${Math.round(block.rect.y)} ${Math.round(block.rect.width)}×${Math.round(block.rect.height)}`
              : "not located on the page"
          }
        />
        <Fact label="size" value={asset ? `${asset.width ?? "?"}×${asset.height ?? "?"} · ${(asset.bytes / 1024).toFixed(0)} KB · ${asset.mime}` : "unknown"} />
        <Fact label="caption" value={caption?.text ?? "none nearby"} />
        <Fact label="labels" value={figure.labels?.length ? figure.labels.map((l) => l.text).join(", ") : "none"} />
      </dl>
      <p className="mt-2">
        {figure.description ? (
          <span className="text-neutral-300">Vision said: {figure.description}</span>
        ) : figure.skipped ? (
          <span className="text-amber-400">Not examined — {figure.skipped}.</span>
        ) : (
          <span className="text-red-400">Never examined, and no reason recorded.</span>
        )}
      </p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd className="truncate text-neutral-400" title={value}>
        {value}
      </dd>
    </div>
  );
}
