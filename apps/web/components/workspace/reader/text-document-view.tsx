"use client";

// A Markdown, plain-text or HTML file, laid out on a page.
//
// 🔴 THREE FORMATS THAT PREVIOUSLY SHOWED A RED ERROR SCREEN. See `text-document.ts` for how they
// were reaching the Word reader and why the fix belongs inside the `document` lane rather than
// beside it.
//
// 🔴🔴 THE HTML LANE IS A SANDBOXED FRAME, NOT INJECTED MARKUP. `docx-blocks.ts` explains why the
// Word reader returns a block model instead of an HTML string: `dangerouslySetInnerHTML` would turn
// every document a student uploads into a scripting surface in the app's own origin, with the
// learner's session sitting right there. An HTML file has to be shown AS HTML — that is the whole
// request — so it goes into an `<iframe srcdoc>` with an empty `sandbox`, which is a fresh opaque
// origin with scripts, forms, popups, top-level navigation and same-origin access all off. The file
// renders exactly as its author wrote it and can reach nothing.

import { useCallback, useEffect, useMemo } from "react";

import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import { decodeText, htmlText, type DocumentFlavour } from "@/lib/reader/text-document";

export interface TextReadyPayload {
  text: string;
}

export function TextDocumentView({
  bytes,
  flavour,
  fileName,
  onReady,
  onError,
  registerElement,
}: {
  bytes: ArrayBuffer;
  flavour: Exclude<DocumentFlavour, "word">;
  fileName: string;
  onReady: (payload: TextReadyPayload) => void;
  onError: (message: string) => void;
  /** The comment layer pins to the article, which is this document's one unit. */
  registerElement?: (unit: number, element: HTMLElement | null) => void;
}) {
  const decoded = useMemo(() => {
    try {
      return { ok: true as const, text: decodeText(bytes) };
    } catch {
      return { ok: false as const, text: "" };
    }
  }, [bytes]);

  useEffect(() => {
    if (!decoded.ok) {
      onError("This file could not be read as text.");
      return;
    }
    onReady({ text: flavour === "html" ? htmlText(decoded.text) : decoded.text });
  }, [decoded, flavour, onError, onReady]);

  if (!decoded.ok) return null;

  // 🔴 THE FRAME FILLS THE PANE AND SCROLLS ITSELF. An iframe cannot size to its content across an
  // origin boundary, and the boundary is the point — so rather than measure it (which needs the
  // same-origin access the sandbox exists to deny) the file gets the whole pane, which is how a
  // browser shows an .html file anyway.
  if (flavour === "html") {
    return (
      <iframe
        className="h-full w-full border-0 bg-(--reader-canvas)"
        data-testid="reader-html-frame"
        sandbox=""
        srcDoc={decoded.text}
        title={fileName}
      />
    );
  }

  return (
    <DocumentPage registerElement={registerElement} testId={`reader-${flavour}-scroll`}>
      {flavour === "markdown" ? (
        // 🔴 THE SAME RENDERER THE ANSWERS USE. A Markdown file and a Markdown answer are the same
        // object arriving from two directions, and a second renderer would drift from this one
        // inside a week — tables, maths and code fences all included.
        <AssistantMarkdown className="nemesis-reading-view" text={decoded.text} />
      ) : (
        // 🔴 `whitespace-pre-wrap`, NOT `pre`. A text file's line breaks are the author's and are
        // kept; its long lines are the terminal's and are wrapped, because a horizontal scrollbar
        // under a paragraph is not how anyone reads.
        <pre className="whitespace-pre-wrap break-words font-mono text-[0.875rem] leading-relaxed">
          {decoded.text}
        </pre>
      )}
    </DocumentPage>
  );
}

/**
 * The sheet a text document is read on.
 *
 * 🔴🔴 A PAGE, BECAUSE THE OWNER ASKED FOR ONE. 2026-09-03, about a .docx in the pane: *"it doesn't
 * really render like a docx, it just looks weird … it's not rendering like a document."* What he
 * was looking at was a bare 68-character column of grey secondary text floating on the app's own
 * background — correct typography with nothing under it, which reads as a broken layout rather than
 * as a file. Every reader in this product already draws its content on `.nemesis-reader-canvas`: a
 * PDF page is one, a slide is one. A Word file was the only document in the app that was not on a
 * sheet, and that inconsistency was the whole complaint.
 *
 * 🔴 THE MEASURE IS UNCHANGED AND STILL CONSTRAINED. The page is wider than the text, not instead
 * of it — the owner's rule about line length is not being reversed here, it is being given a
 * surface to sit on.
 */
export function DocumentPage({
  children,
  registerElement,
  testId,
}: {
  children: React.ReactNode;
  registerElement?: (unit: number, element: HTMLElement | null) => void;
  testId: string;
}) {
  // 🔴 A STABLE REF CALLBACK, NOT AN INLINE ARROW — the same crash `docx-document-view.tsx`
  // documents at length. An inline `ref={(el) => register(1, el)}` is a new function every render,
  // so React detaches and reattaches each time, the host's registry write causes a render, and the
  // page dies with "Maximum update depth exceeded".
  const registerArticle = useCallback((element: HTMLElement | null) => registerElement?.(1, element), [registerElement]);

  return (
    <div className="nemesis-reader-room h-full min-h-0 overflow-auto overscroll-contain px-6 py-6" data-testid={testId}>
      <article className="nemesis-reader-page relative mx-auto" ref={registerArticle}>
        {children}
      </article>
    </div>
  );
}
