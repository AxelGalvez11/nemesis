"use client";

// A PowerPoint deck: slides, outline, and the lecturer's own speaker notes.
//
// 🔴 THESE ARE RECONSTRUCTIONS, AND THE READER SAYS SO. Rasterising a real
// slide needs a layout engine (LibreOffice) that cannot run in a Vercel
// function — see docs/document-intelligence.md §4 and docs/document-reader.md
// §5. What is shown is the deck's real contents — its title placeholder, its
// text at its real outline depth, its embedded pictures and its notes — laid
// out on a slide-shaped canvas. A diagram DRAWN from arrows and boxes is not a
// picture in the file, so it will not appear, and pretending otherwise by
// calling this a "rendered slide" would be the actual failure.

import { useEffect, useMemo, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { officeImageUrl, openOfficeArchive } from "@/lib/reader/office-zip";
import { notesPathFor, parseSlide, slideOrder, slideText, type ParsedSlide } from "@/lib/reader/pptx-slides";
import { findInUnit, highlightRuns } from "@/lib/reader/reader-search";
import { resolveScale, type ZoomMode } from "@/lib/reader/reader-zoom";
import { resolveSlidePictures } from "@/lib/reader/slide-pictures";
import { cn } from "@/lib/utils";

export type SlideTab = "slides" | "outline" | "notes";

export interface SlidesReadyPayload {
  slides: ParsedSlide[];
  unitTexts: { unit: number; text: string }[];
}

interface SlidesDocumentViewProps {
  bytes: ArrayBuffer;
  tab: SlideTab;
  query: string | null;
  zoom: ZoomMode;
  onScaleChange: (scale: number) => void;
  onReady: (payload: SlidesReadyPayload) => void;
  onUnitChange: (unit: number) => void;
  onError: (message: string) => void;
  registerElement: (unit: number, element: HTMLElement | null) => void;
}

/** A 16:9 slide is drawn at this width and scaled from there — the same role
 *  a PDF page's natural size plays in the PDF lane. */
const SLIDE_WIDTH = 880;
/** How many pictures fit down the slide's picture column before each becomes
 *  too small to read. Anything past this is counted out loud, never dropped. */
const MAX_SLIDE_PICTURES = 3;

export function SlidesDocumentView({
  bytes, tab, query, zoom, onScaleChange, onReady, onUnitChange, onError, registerElement,
}: SlidesDocumentViewProps) {
  const [slides, setSlides] = useState<ParsedSlide[] | null>(null);
  const [images, setImages] = useState<Map<string, string>>(new Map());
  const [container, setContainer] = useState({ width: 0, height: 0 });
  // 🔴 A CALLBACK ref, not useRef: the scroll column does not exist on the
  // first render (the deck is still being unzipped), so a ref read in a
  // mount-time effect is null and the observer never attaches — leaving every
  // slide at its full 880px with a horizontal scrollbar under the deck.
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = scrollElement;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setContainer({ width: Math.max(0, box.width), height: Math.max(0, box.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollElement]);

  const scale = useMemo(
    () =>
      Math.min(
        resolveScale(zoom, {
          pageWidth: SLIDE_WIDTH,
          pageHeight: (SLIDE_WIDTH / 16) * 9,
          containerWidth: container.width,
          containerHeight: container.height,
        }),
        2,
      ),
    [container.height, container.width, zoom],
  );

  useEffect(() => onScaleChange(scale), [onScaleChange, scale]);

  useEffect(() => {
    let urls: string[] = [];
    try {
      const archive = openOfficeArchive(bytes);
      const order = slideOrder(archive.files, archive.text("ppt/presentation.xml"), archive.text("ppt/_rels/presentation.xml.rels"));
      if (order.length === 0) throw new Error("This doesn't look like a PowerPoint (.pptx) file.");

      const parsed = order.map((path, index) => {
        const relsPath = path.replace(/^(.*)\/([^/]+)$/, "$1/_rels/$2.rels");
        const rels = archive.text(relsPath);
        const notesPath = notesPathFor(rels, path);
        return parseSlide(index + 1, archive.text(path) ?? "", rels, path, notesPath ? archive.text(notesPath) : null);
      });

      const resolved = new Map<string, string>();
      for (const slide of parsed) {
        for (const picture of slide.pictures) {
          if (!picture.target || resolved.has(picture.target)) continue;
          const url = officeImageUrl(archive, picture.target);
          if (url) {
            resolved.set(picture.target, url);
            urls.push(url);
          }
        }
      }

      setSlides(parsed);
      setImages(resolved);
      onReady({ slides: parsed, unitTexts: parsed.map((slide) => ({ unit: slide.index, text: slideText(slide) })) });
    } catch (error) {
      onError(error instanceof Error ? error.message : "This deck could not be opened.");
    }
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls = [];
    };
  }, [bytes, onError, onReady]);

  const withNotes = useMemo(() => (slides ?? []).filter((slide) => slide.notes), [slides]);

  if (slides === null) return <div className="grid h-full place-items-center text-xs text-(--ui-text-tertiary)">Opening…</div>;

  if (tab === "outline") {
    return (
      <div className="h-full min-h-0 overflow-auto overscroll-contain px-8 py-6" data-testid="reader-slides-outline">
        <div className="nemesis-reading-view mx-auto">
          <Disclaimer />
          {slides.map((slide) => (
            <section className="mt-7 first:mt-0" key={slide.index}>
              <button
                className="flex w-full items-baseline gap-2 text-left"
                onClick={() => onUnitChange(slide.index)}
                type="button"
              >
                <span className="shrink-0 tabular-nums text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-quaternary)">
                  Slide {slide.index}
                </span>
                <span className="min-w-0 flex-1 text-[1rem] font-semibold text-foreground">
                  <Painted query={query} text={slide.title ?? "Untitled slide"} />
                </span>
              </button>
              <ul className="mt-2 flex flex-col gap-1">
                {slide.paragraphs.map((paragraph, index) => (
                  <li
                    className="flex gap-2 text-[0.9375rem] text-(--ui-text-secondary)"
                    key={index}
                    style={{ paddingInlineStart: `${paragraph.level * 1.1}rem` }}
                  >
                    <span aria-hidden className="mt-[0.6em] size-1 shrink-0 rounded-full bg-(--ui-text-quaternary)" />
                    <span className="min-w-0 flex-1">
                      <Painted query={query} text={paragraph.text} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    );
  }

  if (tab === "notes") {
    return (
      <div className="h-full min-h-0 overflow-auto overscroll-contain px-8 py-6" data-testid="reader-slides-notes">
        <div className="nemesis-reading-view mx-auto">
          {withNotes.length === 0 ? (
            <p className="py-12 text-center text-sm text-(--ui-text-tertiary)">
              This deck has no speaker notes.
            </p>
          ) : (
            withNotes.map((slide) => (
              <section className="mt-7 first:mt-0" key={slide.index}>
                <button
                  className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-quaternary)"
                  onClick={() => onUnitChange(slide.index)}
                  type="button"
                >
                  Slide {slide.index}
                  {slide.title ? ` · ${slide.title}` : ""}
                </button>
                <p className="mt-1.5 whitespace-pre-wrap text-(--ui-text-secondary)">
                  <Painted query={query} text={slide.notes ?? ""} />
                </p>
              </section>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-auto overscroll-contain px-6 py-6" data-testid="reader-slides-scroll" ref={setScrollElement}>
      <div className="mx-auto flex w-fit flex-col items-center gap-5">
        <div className="w-full max-w-3xl">
          <Disclaimer />
        </div>
        {slides.map((slide) => (
          <SlideCanvas
            images={images}
            key={slide.index}
            onVisible={onUnitChange}
            query={query}
            registerElement={registerElement}
            scale={scale}
            slide={slide}
          />
        ))}
      </div>
    </div>
  );
}

function Disclaimer() {
  return (
    <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) px-3.5 py-2.5">
      <Codicon className="mt-0.5 shrink-0 text-(--ui-text-tertiary)" name="info" size="0.85rem" />
      <p className="text-xs leading-relaxed text-(--ui-text-secondary)">
        <span className="font-medium text-foreground">
          These are rebuilt from the deck&rsquo;s contents, not pictures of the slides.
        </span>{" "}
        Text, pictures and notes are the real ones. Anything the author <em>drew</em> — arrows, boxes, SmartArt — is not
        a picture in the file, so it is not here. Slide images are coming; they need a renderer Nemesis does not host yet.
      </p>
    </div>
  );
}

/** A slide-shaped canvas, 16:9, holding the slide's real contents. */
function SlideCanvas({
  slide, images, query, scale, onVisible, registerElement,
}: {
  slide: ParsedSlide;
  images: Map<string, string>;
  query: string | null;
  scale: number;
  onVisible: (unit: number) => void;
  registerElement: (unit: number, element: HTMLElement | null) => void;
}) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const { shown, overflow, missing, missingFormats } = resolveSlidePictures(slide.pictures, images, MAX_SLIDE_PICTURES);
  const hasPictureColumn = shown.length > 0 || overflow > 0 || missing > 0;

  useEffect(() => {
    registerElement(slide.index, element);
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.intersectionRatio > 0.45) onVisible(slide.index);
      },
      { threshold: [0, 0.45, 0.9] },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      registerElement(slide.index, null);
    };
  }, [element, onVisible, registerElement, slide.index]);

  return (
    <figure className="flex flex-col items-center gap-1.5" ref={setElement}>
      <div
        className="nemesis-reader-canvas flex flex-col gap-3 p-7"
        data-testid={`reader-slide-${slide.index}`}
        style={{ width: Math.round(SLIDE_WIDTH * scale), aspectRatio: "16 / 9", color: "#111318" }}
      >
        {slide.title && (
          <h3 className="text-[1.35em] font-semibold leading-tight" style={{ fontSize: `${1.35 * scale}rem` }}>
            <Painted query={query} text={slide.title} />
          </h3>
        )}
        <div className="flex min-h-0 flex-1 gap-5">
          <ul className="flex min-w-0 flex-1 flex-col gap-1.5 overflow-hidden">
            {slide.paragraphs.map((paragraph, index) => (
              <li
                className="flex gap-2 leading-snug"
                key={index}
                style={{ fontSize: `${(0.95 - paragraph.level * 0.07) * scale}rem`, paddingInlineStart: `${paragraph.level * 1.1}rem` }}
              >
                <span aria-hidden className="mt-[0.6em] size-1 shrink-0 rounded-full" style={{ background: "#9aa0a8" }} />
                <span className="min-w-0 flex-1">
                  <Painted query={query} text={paragraph.text} />
                </span>
              </li>
            ))}
          </ul>
          {hasPictureColumn && (
            <div className={cn("flex shrink-0 flex-col gap-2", slide.paragraphs.length > 0 ? "w-2/5" : "w-full")}>
              {shown.map((url, index) => (
                // eslint-disable-next-line @next/next/no-img-element -- an in-memory object URL for bytes already in the browser
                <img alt="" className="min-h-0 w-full flex-1 rounded object-contain" key={index} src={url} />
              ))}
              {missing > 0 && (
                <p
                  className="flex min-h-0 flex-1 items-center justify-center rounded border border-dashed px-2 text-center leading-snug"
                  data-testid={`reader-slide-${slide.index}-missing-pictures`}
                  style={{ borderColor: "#c9ced6", color: "#6b7280", fontSize: `${0.7 * scale}rem` }}
                >
                  {missing === 1 ? "1 picture" : `${missing} pictures`} in this slide
                  {missingFormats.length > 0 ? ` (${missingFormats.join(", ")})` : ""} cannot be shown yet — open the
                  original to see {missing === 1 ? "it" : "them"}.
                </p>
              )}
              {overflow > 0 && (
                <p className="text-center" style={{ color: "#6b7280", fontSize: `${0.7 * scale}rem` }}>
                  +{overflow} more {overflow === 1 ? "picture" : "pictures"} on this slide
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      <figcaption className="tabular-nums text-[0.6875rem] text-(--ui-text-tertiary)">Slide {slide.index}</figcaption>
    </figure>
  );
}

function Painted({ text, query }: { text: string; query: string | null }) {
  if (!query) return <>{text}</>;
  const ranges = findInUnit(text, query, 1);
  if (ranges.length === 0) return <>{text}</>;
  return (
    <>
      {highlightRuns(text, ranges).map((run, index) =>
        run.highlighted ? (
          <mark key={index} style={{ background: "rgba(255, 214, 0, 0.45)", color: "inherit" }}>
            {run.text}
          </mark>
        ) : (
          <span key={index}>{run.text}</span>
        ),
      )}
    </>
  );
}
