"use client";

// Where a claim came from, as something you can press.
//
// 🔴 THIS REPLACES A LINE OF GREY TEXT. `SourceTrail` printed "From 3.1Functional Groups" at
// `--ui-text-quaternary`, which is the treatment this app gives to things nobody is meant to act
// on. It was also, in the owner's words, part of the "unnecessary wordy gray text" — and the answer
// to that is not to delete the provenance (a claim that loses its origin is what the evidence rules
// exist to prevent) but to make it worth the space: a site you recognise by its icon, or a document
// you can look inside.
//
// 🔴 WHAT IS PRESSABLE IS DECIDED IN `lib/learn/source-pill.ts`, NOT HERE. A page opens; a document
// previews; a citation this canvas cannot resolve produces no pill at all. This file draws that
// decision and never re-makes it.

import { useEffect, useRef, useState } from "react";

import { faviconUrl } from "@/lib/favicon";
import type { SourcePill } from "@/lib/learn/source-pill";

/** 14px, matching the favicon dots the chat surface already uses for citations. Written in px
 *  because every rem in this app is 1.125x its number. */
const FAVICON_PX = 14;

export function CanvasSourcePills({ pills }: { pills: readonly SourcePill[] }) {
  const [preview, setPreview] = useState<SourcePill | null>(null);

  if (pills.length === 0) return null;

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {pills.map((pill) =>
          pill.kind === "web" ? (
            <a
              className="inline-flex items-center gap-1.5 rounded-full bg-(--ui-bg-elevated) py-1 pl-1.5 pr-2.5 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary) no-underline ring-1 ring-(--ui-stroke-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
              href={pill.url}
              key={`web:${pill.url}`}
              rel="noopener noreferrer"
              target="_blank"
              title={pill.title}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- remote favicon service, not a static asset. */}
              <img
                alt=""
                className="rounded-full"
                height={FAVICON_PX}
                src={faviconUrl(pill.host)}
                width={FAVICON_PX}
              />
              {pill.label}
            </a>
          ) : (
            <button
              className="inline-flex items-center gap-1.5 rounded-full bg-(--ui-bg-elevated) py-1 pl-1.5 pr-2.5 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
              key={`doc:${pill.label}`}
              onClick={() => setPreview(pill)}
              title={pill.title}
              type="button"
            >
              {/* 🔴 A DOCUMENT MARK, NOT A FAVICON PLACEHOLDER. A grey circle where a site icon
                  would be reads as a page whose icon failed to load, which is a different and
                  worse claim than "this is a file you uploaded". */}
              <span
                aria-hidden="true"
                className="flex items-center justify-center rounded-full bg-(--ui-bg-tertiary) text-(--ui-text-tertiary)"
                style={{ height: FAVICON_PX, width: FAVICON_PX }}
              >
                <svg fill="none" height="9" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 12 12" width="9">
                  <path d="M3 1.5h4l2 2v7H3z" strokeLinejoin="round" />
                  <path d="M7 1.5v2h2" strokeLinejoin="round" />
                </svg>
              </span>
              {pill.label}
            </button>
          ),
        )}
      </div>
      {preview && preview.kind === "document" && (
        <DocumentPreview onClose={() => setPreview(null)} pill={preview} />
      )}
    </>
  );
}

/**
 * The passage a claim came out of, shown in place.
 *
 * 🔴 IT IS NOT A ROUTE AND IT DOES NOT LEAVE THE CANVAS. Sending someone to a document viewer to
 * check one sentence costs them the question they were looking at; §38 already removed the
 * navigation rail from inside a canvas for the same reason.
 *
 * 🔴 ESCAPE AND A PRESS OUTSIDE BOTH CLOSE IT. Without the first it is a keyboard trap; this repo
 * has shipped one before (`canvas-home.tsx`'s add menu carried both from the start for that reason).
 */
function DocumentPreview({ onClose, pill }: { onClose: () => void; pill: Extract<SourcePill, { kind: "document" }> }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointer = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    // 🔴 DEFERRED BY A TICK. The press that OPENED this is still propagating; binding synchronously
    // closes it in the same gesture that opened it.
    const timer = window.setTimeout(() => document.addEventListener("pointerdown", onPointer), 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/25" />
      <div
        className="relative max-h-[70vh] w-full max-w-[560px] overflow-y-auto rounded-2xl bg-(--ui-bg-elevated) p-6 shadow-[0_12px_40px_rgba(0,0,0,0.18)] ring-1 ring-(--ui-stroke-tertiary)"
        ref={box}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-[length:var(--canvas-text-body)] font-medium text-(--ui-text-primary)">
              {pill.label}
            </h3>
            {pill.section && (
              <p className="mt-0.5 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">{pill.section}</p>
            )}
          </div>
          <button
            aria-label="Close"
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
            onClick={onClose}
            type="button"
          >
            <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 16 16" width="12">
              <path d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5" />
            </svg>
          </button>
        </div>
        {/* 🔴 THE PASSAGE, SELECTABLE, AND IT SAYS SO WHEN THERE IS NONE. A reparse can dissolve the
            excerpt a citation pointed at; the document is still real and still worth naming, so the
            pill stays and this is where the gap is admitted rather than papered over. */}
        {pill.excerpt ? (
          <p
            className="mt-4 whitespace-pre-wrap text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-secondary)"
            data-selectable-text="true"
          >
            {pill.excerpt}
          </p>
        ) : (
          <p className="mt-4 text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-tertiary)">
            Nemesis no longer holds the exact passage from this document.
          </p>
        )}
      </div>
    </div>
  );
}
