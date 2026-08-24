"use client";

// A retrieved teaching picture, shown WITH the credit its licence asks for (§42, rung three).
//
// 🔴 THE CREDIT LINE IS PART OF SHOWING THE PICTURE, NOT A COURTESY. `chooseAsset` refuses a
// BY-licensed image whose attribution was not kept precisely so that this component always has
// something to render when one is owed. A licence kept in a field and never drawn is a record of a
// promise nobody kept — so the credit renders unconditionally, from the same object that carried
// the licence through the router.
//
// 🔴 A PLAIN `<img>`, DELIBERATELY. The asset URL is a bounded rendition from an allow-listed host
// (see `REFERENCE_ASSET_HOSTS`); routing it through an optimiser would add a second fetch of a
// third-party file on every page view for pixels that are already sized. `referrerPolicy` keeps
// canvas URLs out of repository logs — the same privacy line the resolver routes hold.

import { useState } from "react";

import { creditLineFor, type CandidateAsset } from "@/lib/learn/visual-provenance";

export function ReferenceFigure({ asset, caption }: { asset: CandidateAsset; caption?: string }) {
  const [failed, setFailed] = useState(false);
  // 🔴 A DEAD LINK RENDERS NOTHING, NOT A BROKEN FRAME. A hotlinked file can move — the registry
  // header names this exact weakness — and a broken-image glyph in the middle of a lesson is worse
  // than the prose standing alone, which is what every other refused visual already degrades to.
  if (failed) return null;
  const credit = creditLineFor(asset);
  const shown = caption ?? asset.caption;
  return (
    <figure className="my-4 overflow-hidden rounded-xl border border-(--ui-stroke-tertiary) p-4">
      <img
        alt={shown ?? "Reference figure"}
        className="mx-auto max-h-105 w-auto max-w-full rounded-md"
        loading="lazy"
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
        src={asset.assetPath}
      />
      {shown && (
        <figcaption className="mt-3 text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-tertiary)">
          {shown}
        </figcaption>
      )}
      {credit && (
        <p className="mt-1 text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-tertiary)">
          {asset.licence?.url ? (
            <a
              className="underline decoration-(--ui-stroke-primary) underline-offset-2 hover:text-(--ui-text-secondary)"
              href={asset.licence.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              {credit}
            </a>
          ) : (
            credit
          )}
        </p>
      )}
    </figure>
  );
}
