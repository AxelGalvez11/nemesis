"use client";

// MessageResponse, the one Markdown primitive this workspace renders answers with. The real
// renderer (Streamdown plus its code, math, CJK and lazy Mermaid plugins, which drag in shiki)
// lives in message-streamdown.tsx and is loaded on demand: /learn and /study pull this file in
// through the study dialogs, and neither page should pay for a Markdown engine in its entry
// script before a single message is on screen. Until the chunk arrives the raw Markdown shows
// as pre-wrapped text, so a streaming answer is never a blank box.
//
// Props are the Streamdown props, unchanged; the type comes from the package as a type-only
// import, which the bundler erases.
import { lazy, memo, Suspense, type ComponentProps } from "react";
import type { Streamdown } from "streamdown";

import { cn } from "@/lib/utils";

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

const StreamdownResponse = lazy(() => import("./message-streamdown"));

/** The raw Markdown, pre-wrapped, shown until the renderer chunk has loaded. */
function PlainTextResponse({ children, className }: MessageResponseProps) {
  return (
    <div className={cn("size-full whitespace-pre-wrap break-words", className)}>
      {typeof children === "string" ? children : null}
    </div>
  );
}

export const MessageResponse = memo(
  (props: MessageResponseProps) => (
    <Suspense fallback={<PlainTextResponse {...props} />}>
      <StreamdownResponse {...props} />
    </Suspense>
  ),
  (previous, next) =>
    previous.children === next.children && previous.isAnimating === next.isAnimating,
);

MessageResponse.displayName = "MessageResponse";
