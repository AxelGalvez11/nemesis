"use client";

// The file, handed back where the work happened.
//
// 🔴🔴 A NOTICE STRIP IS NOT A HAND-OVER, AND THE OWNER SHOWED THE DIFFERENCE (2026-08-25, *"should
// work like this btw"*, with screenshots). A finished document used to announce itself in one line
// of transient notice text and then live behind a control the learner had to know to open. In the
// reference the file arrives in the conversation as an object with a name on it — the same way a
// person hands you a document rather than telling you which drawer it is in.
//
// 🔴 IT IS A RECEIPT, NOT A SECOND LIST. The outputs panel already keeps everything this canvas has
// made; this is the one that just arrived, and the next make replaces it. Two growing lists of the
// same things would be two places to fix when one is wrong.

import { Codicon } from "@/components/desktop-ui/codicon";
import { docFilename } from "@/lib/export/doc-file";
import type { CanvasOutput } from "@/lib/learn/canvas-model";
import { KIND_MARKS } from "@/lib/learn/kind-mark";

/**
 * How each kind presents itself: the glyph, its tint, and the extension it hands over as.
 *
 * 🔴🔴 THE GLYPHS AND TINTS MOVED TO `kind-mark.ts` ON 2026-09-03, AND NOTHING ABOUT THEM CHANGED.
 * Owner, about the sources panel: *"the inputs need to have a unique icon depending on whether it's
 * a docx, PowerPoint, Excel etc."* The marks for that were already chosen — here — for the files a
 * canvas MAKES, so the shelf reads them from a shared record instead of a second table that would
 * agree with this one for about a week. An attached .docx and a produced .docx are the same kind of
 * object, and they now say so.
 *
 * 🔴 THE EXTENSION STAYS HERE, because it is not a fact about a KIND of file. It is what THIS
 * surface hands the file over as, and it is meaningless for the three outputs that are not files.
 */
const KIND: Record<string, { extension: string; icon: string; label: string; tint: string }> = {
  document: { extension: "docx", ...KIND_MARKS.document },
  flashcards: { extension: "", icon: "layers", label: "Flashcards", tint: "--ui-kind-purple" },
  note: { extension: "", ...KIND_MARKS.text },
  pdf: { extension: "pdf", ...KIND_MARKS.pdf },
  report: { extension: "", icon: "book", label: "Research", tint: "--ui-kind-cyan" },
  sheet: { extension: "csv", ...KIND_MARKS.sheet },
  slides: { extension: "pptx", ...KIND_MARKS.slides },
};

export function ArtifactCard({ onOpen, output }: { onOpen: () => void; output: CanvasOutput }) {
  const kind = KIND[output.kind] ?? { extension: "", icon: "file", label: output.kind, tint: "--ui-kind-blue" };
  // 🔴 THE REAL FILENAME, BUILT BY THE FUNCTION THAT NAMES THE DOWNLOAD. Showing `title.pdf` here
  // while the saved file is called something else is a small lie that only surfaces in the
  // Downloads folder, which is the worst place to find out.
  const filename = kind.extension ? docFilename(output.title, kind.extension) : output.title;

  return (
    <section aria-label="What Nemesis made" className="canvas-swap my-3">
      <p className="m-0 mb-2 text-[length:var(--canvas-text-body)] text-(--ui-text-primary)">
        {/* 🔴 A COLON, NOT AN EM DASH. `canvas-copy.test.ts` bans them in learner-facing copy on
            this surface by owner rule, and it caught this line. */}
        {kind.label} ready: <span className="font-medium">{output.title}</span>
      </p>
      {/* 🔴 A BUTTON, NOT AN ANCHOR. It opens the reader on this surface; an anchor would promise a
          navigation, and middle-clicking it would open a page that does not exist. */}
      <button
        className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary)"
        onClick={onOpen}
        type="button"
      >
        <Codicon className="shrink-0" name={kind.icon} size="22px" style={{ color: `var(${kind.tint})` }} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">{filename}</span>
          <span className="text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">{kind.label}</span>
        </span>
      </button>
    </section>
  );
}
