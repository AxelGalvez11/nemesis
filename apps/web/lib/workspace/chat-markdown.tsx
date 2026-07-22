// Assistant prose renderer — desktop src/components/assistant-ui/markdown-text.tsx
// (shell spec §B6), ported onto react-markdown + remark-gfm + remark-math +
// rehype-katex (the streaming/Shiki/mermaid machinery is out of scope for the
// non-streaming v1 wire recipe — fenced code renders as a plain mono block).

import type { Components } from "react-markdown";
import { Children } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { faviconUrl, hostnameOf, sourceLabel } from "@/lib/favicon";
import { cn } from "@/lib/utils";
import { obsidianTagsToMarkdown, wikiLinksToMarkdown } from "@/lib/workspace/library-links";
import { normalizeMathDelimiters } from "@/lib/workspace/markdown-math";

const MARKDOWN_CONTAINER_CLASS_NAME =
  "aui-md prose w-full max-w-none overflow-hidden text-[length:var(--conversation-text-font-size)] " +
  "leading-(--dt-line-height) text-foreground " +
  "prose-p:leading-(--dt-line-height) prose-li:leading-(--dt-line-height) " +
  "prose-headings:text-foreground prose-strong:text-foreground " +
  "prose-a:break-words prose-p:[overflow-wrap:anywhere] " +
  "prose-li:marker:text-muted-foreground/70 " +
  "prose-code:rounded-[0.25rem] prose-code:px-[0.1875rem] prose-code:py-px prose-code:font-mono " +
  "prose-code:text-[0.9em] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none " +
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&>*+*]:mt-(--paragraph-gap)";

const CODE_BLOCK_LANGUAGE_RE = /language-/;

/** A web result the answer can cite. Structural, so SessionSource fits as-is. */
export interface CitationSource {
  title: string;
  url: string;
}

// Answers ground themselves on numbered search results and cite them as [1]..[5].
// Turn those markers into links the `a` renderer paints as favicon pills. Fenced
// blocks and inline code are skipped so an array index in a snippet stays literal,
// and `[1](...)` is left alone because it is already a markdown link.
const CITE_MARKER_RE = /\[(\d{1,2})\](?!\()/g;
const CODE_SEGMENT_RE = /(```[\s\S]*?```|`[^`\n]*`)/g;

function citationsToMarkdown(text: string, sourceCount: number): string {
  if (sourceCount <= 0) return text;
  return text
    .split(CODE_SEGMENT_RE)
    .map((chunk, index) =>
      index % 2 === 1
        ? chunk
        : chunk.replace(CITE_MARKER_RE, (match, digits: string) => {
            const n = Number.parseInt(digits, 10);
            return n >= 1 && n <= sourceCount ? `[${n}](#nemesis-cite=${n})` : match;
          }),
    )
    .join("");
}

export function slugifyHeading(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function headingText(children: React.ReactNode): string {
  return Children.toArray(children).map((child) => (typeof child === "string" || typeof child === "number" ? String(child) : "")).join("");
}

function markdownComponents(
  onWikiLink?: (target: string) => void,
  isWikiLinkAvailable?: (target: string) => boolean,
  externalLinksInNewTab = true,
  sources?: ReadonlyArray<CitationSource>,
): Components {
  return {
    a: ({ children, href }) => {
      if (href === "#nemesis-highlight") {
        return <mark className="rounded-[0.2rem] bg-[color-mix(in_srgb,var(--theme-primary)_24%,transparent)] px-0.5 text-inherit">{children}</mark>;
      }
      if (href === "#nemesis-underline") {
        return <span className="underline underline-offset-[0.2em]">{children}</span>;
      }
      if (href === "#nemesis-sub") {
        return <sub>{children}</sub>;
      }
      if (href === "#nemesis-sup") {
        return <sup>{children}</sup>;
      }
      const tag = href?.startsWith("#nemesis-tag=")
        ? decodeURIComponent(href.slice("#nemesis-tag=".length))
        : null;
      if (tag) {
        return (
          <span
            className="mx-0.5 inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--theme-primary)_12%,transparent)] px-2 py-0.5 align-baseline text-[0.82em] font-medium text-[var(--theme-primary)]"
            data-library-tag={tag}
          >
            #{tag}
          </span>
        );
      }
      const citeIndex = href?.startsWith("#nemesis-cite=")
        ? Number.parseInt(href.slice("#nemesis-cite=".length), 10)
        : null;
      if (citeIndex !== null) {
        const source = sources?.[citeIndex - 1];
        // Pre-processing only emits in-range markers, so a miss means stale
        // markup (an edited/replayed answer) — drop the chip rather than leave
        // a bare number sitting in the prose.
        if (!source) return null;
        const host = hostnameOf(source.url);
        return (
          <a
            className="mx-0.5 inline-flex items-center gap-1 rounded-full border border-(--ui-stroke-tertiary) bg-(--ui-bg-secondary) px-1.5 py-px align-baseline text-[0.78em] font-medium text-(--ui-text-secondary) no-underline hover:bg-(--ui-control-hover-background)"
            href={source.url}
            rel="noopener noreferrer"
            target="_blank"
            title={source.title || source.url}
          >
            {host && (
              // eslint-disable-next-line @next/next/no-img-element -- remote favicon service, not a static asset.
              <img alt="" className="size-3 rounded-full" src={faviconUrl(host)} />
            )}
            {sourceLabel(source.url) ?? host}
          </a>
        );
      }
      const wikiTarget = href?.startsWith("#nemesis-note=")
        ? decodeURIComponent(href.slice("#nemesis-note=".length))
        : null;
      const wikiAvailable = wikiTarget ? (isWikiLinkAvailable?.(wikiTarget) ?? true) : true;
      if (wikiTarget) {
        return (
          <button
            aria-label={!wikiAvailable ? `Create note ${wikiTarget}` : undefined}
            className={cn(
              "inline cursor-pointer break-words border-0 bg-transparent p-0 align-baseline font-[inherit] underline underline-offset-4",
              wikiAvailable ? "font-medium text-[var(--theme-primary)] decoration-2 hover:decoration-current" : "text-(--ui-text-quaternary) decoration-current/35",
            )}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onWikiLink?.(wikiTarget);
            }}
            style={{
              color: wikiAvailable ? "var(--theme-primary)" : "var(--ui-text-quaternary)",
              textDecorationColor: wikiAvailable ? "currentColor" : "color-mix(in srgb, currentColor 35%, transparent)",
              textDecorationLine: "underline",
              textDecorationThickness: wikiAvailable ? "2px" : "1px",
              textUnderlineOffset: "0.25rem",
            }}
            type="button"
          >
            {children}
          </button>
        );
      }
      return (
        <a
          className={cn(
            "break-words underline underline-offset-4",
            "text-[var(--theme-primary)] decoration-2 hover:decoration-current",
          )}
          href={href}
          rel="noopener noreferrer"
          style={{
            color: "var(--theme-primary)",
            textDecorationColor: "currentColor",
            textDecorationLine: "underline",
            textDecorationThickness: "2px",
            textUnderlineOffset: "0.25rem",
          }}
          target={!externalLinksInNewTab ? undefined : "_blank"}
        >
          {children}
        </a>
      );
    },
    blockquote: ({ children }) => (
      <blockquote className="border-s-2 border-border ps-3 text-muted-foreground italic" dir="auto">
        {children}
      </blockquote>
    ),
    code: ({ className, children, ...props }) => {
      if (CODE_BLOCK_LANGUAGE_RE.test(className ?? "")) {
        return (
          <code className={cn("block overflow-x-auto whitespace-pre font-mono text-[0.8em]", className)} {...props}>
            {children}
          </code>
        );
      }

      return (
        <code dir="ltr" {...props}>
          {children}
        </code>
      );
    },
    h1: ({ children }) => <h1 className="my-1 text-[1rem] font-semibold tracking-tight" id={slugifyHeading(headingText(children))}>{children}</h1>,
    h2: ({ children }) => <h2 className="my-1 text-[0.9375rem] font-semibold tracking-tight" id={slugifyHeading(headingText(children))}>{children}</h2>,
    h3: ({ children }) => <h3 className="my-1 text-[0.875rem] font-semibold" id={slugifyHeading(headingText(children))}>{children}</h3>,
    h4: ({ children }) => <h4 className="my-1 text-[0.8125rem] font-semibold" id={slugifyHeading(headingText(children))}>{children}</h4>,
    hr: () => <hr className="my-5 border-0 border-t border-(--ui-stroke-secondary)" />,
    img: ({ alt, src }) =>
      typeof src === "string" ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote/blob markdown images, not a static asset.
        <img alt={alt ?? ""} className="max-w-full rounded-[0.375rem]" src={src} />
      ) : null,
    li: ({ children }) => <li className="leading-(--dt-line-height)">{children}</li>,
    ol: ({ children }) => (
      <ol className="my-1 gap-0" dir="auto">
        {children}
      </ol>
    ),
    p: ({ children }) => <p className="wrap-anywhere leading-(--dt-line-height)">{children}</p>,
    pre: ({ children }) => (
      // text-foreground: typography's default pre-code color is a light gray
      // meant for dark code backgrounds — on this light bg-muted/35 box it
      // rendered plain (language-less) code blocks near-invisible.
      <pre className="aui-md-code-block my-2 overflow-x-auto rounded-[0.375rem] border border-border bg-muted/35 p-2.5 text-foreground">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="aui-md-table my-2 max-w-full overflow-x-auto rounded-[0.375rem] border border-border">
        {/* !m-0: typography's table margin survives a bare m-0 here and drew
            an empty band between the wrapper border and the header row. */}
        <table className="!m-0 w-full min-w-[18rem] border-collapse text-[0.8125rem] [&_tr]:border-b [&_tr]:border-border last:[&_tr]:border-0">
          {children}
        </table>
      </div>
    ),
    td: ({ children }) => <td className="px-2.5 py-1.5 align-top text-[0.8125rem] leading-snug">{children}</td>,
    th: ({ children }) => (
      <th className="whitespace-nowrap px-2.5 py-1.5 text-left align-middle text-[0.75rem] font-medium text-muted-foreground">
        {children}
      </th>
    ),
    thead: ({ children }) => <thead className="m-0 bg-muted/35 text-muted-foreground">{children}</thead>,
    ul: ({ children }) => (
      <ul className="my-1 gap-0" dir="auto">
        {children}
      </ul>
    ),
  };
}

export function AssistantMarkdown({
  className,
  text,
  sources,
  onWikiLink,
  isWikiLinkAvailable,
  externalLinksInNewTab = true,
  obsidianHighlights = false,
  obsidianTags = false,
  obsidianUnderline = false,
  htmlSubSup = false,
}: {
  className?: string;
  text: string;
  /** Numbered web results backing this answer. Supplying them turns the answer's
   *  [n] markers into inline source pills; omitting them leaves the text as-is. */
  sources?: ReadonlyArray<CitationSource>;
  onWikiLink?: (target: string) => void;
  isWikiLinkAvailable?: (target: string) => boolean;
  externalLinksInNewTab?: boolean;
  obsidianHighlights?: boolean;
  obsidianTags?: boolean;
  /** Render `<u>…</u>` as underlined text (react-markdown escapes raw HTML,
   *  so notes written with the editor's Underline button showed the literal
   *  tags). Same safe pre-process trick as obsidianHighlights — never
   *  rehype-raw. */
  obsidianUnderline?: boolean;
  /** Render `<sub>…</sub>`/`<sup>…</sup>` as real sub/superscripts — study
   *  cards imported from Anki keep chemistry formatting (H<sub>2</sub>O) as
   *  bare tags. Same safe pre-process trick, never rehype-raw. */
  htmlSubSup?: boolean;
}) {
  const taggedMarkdown = obsidianTags ? obsidianTagsToMarkdown(text) : text;
  const highlighted = obsidianHighlights
    ? taggedMarkdown.replace(/==([^=\n]+)==/g, (_match, value: string) => `[${value.replace(/([\]\\])/g, "\\$1")}](#nemesis-highlight)`)
    : taggedMarkdown;
  const underlined = obsidianUnderline
    ? highlighted.replace(/<u>([^<\n]+)<\/u>/g, (_match, value: string) => `[${value.replace(/([\]\\])/g, "\\$1")}](#nemesis-underline)`)
    : highlighted;
  const markdown = htmlSubSup
    ? underlined
        .replace(/<sub>([^<\n]+)<\/sub>/gi, (_match, value: string) => `[${value.replace(/([\]\\])/g, "\\$1")}](#nemesis-sub)`)
        .replace(/<sup>([^<\n]+)<\/sup>/gi, (_match, value: string) => `[${value.replace(/([\]\\])/g, "\\$1")}](#nemesis-sup)`)
    : underlined;
  const cited = citationsToMarkdown(markdown, sources?.length ?? 0);
  return (
    <div className={cn(MARKDOWN_CONTAINER_CLASS_NAME, className)}>
      <ReactMarkdown
        components={markdownComponents(onWikiLink, isWikiLinkAvailable, externalLinksInNewTab, sources)}
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkGfm, remarkMath]}
      >
        {normalizeMathDelimiters(onWikiLink ? wikiLinksToMarkdown(cited) : cited)}
      </ReactMarkdown>
    </div>
  );
}
