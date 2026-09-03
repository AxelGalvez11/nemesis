"use client";

// Installed from the AI Elements message registry, then intentionally reduced
// to the one primitive this workspace uses. Keeping MessageResponse preserves
// Streamdown's streaming-safe Markdown, math, code, Mermaid, and CJK rendering
// without shipping the unused message-branch and toolbar components.

// 🔴🔴 `@streamdown/mermaid` IS DELIBERATELY NOT IMPORTED HERE, AND THAT IS A PERFORMANCE FIX WITH
// A NUMBER ON IT. That package's published module is one line long and it begins
// `import n from "mermaid"` — a static import, so every chunk that could render a message carried
// the whole library. Measured on production 2026-09-02: `/learn` shipped 8.86 MB of JavaScript in
// 69 files and its largest chunk was 4.12 MB. The marginal cost of that one import, bundled with
// esbuild beside the other three plugins: 3.12 MB minified, 854 KB gzipped.
//
// `mermaid-plugin.ts` is the same plugin with the library loaded on first draw instead, sharing the
// one engine the chat fence already used. See `mermaid-is-lazy.test.ts`, which fails if the static
// import comes back.
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { memo, type ComponentProps } from "react";
import { Streamdown } from "streamdown";

import { cn } from "@/lib/utils";
import { mermaidPlugin } from "@/lib/workspace/mermaid-plugin";

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

const streamdownPlugins = { cjk, code, math, mermaid: mermaidPlugin };

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
      plugins={streamdownPlugins}
      {...props}
    />
  ),
  (previous, next) =>
    previous.children === next.children && previous.isAnimating === next.isAnimating,
);

MessageResponse.displayName = "MessageResponse";
