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

import { cn } from "@/lib/utils";
import { wikiLinksToMarkdown } from "@/lib/workspace/library-links";
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
): Components {
  return {
    a: ({ children, href }) => {
      const wikiTarget = href?.startsWith("#nemesis-note=")
        ? decodeURIComponent(href.slice("#nemesis-note=".length))
        : null;
      const wikiAvailable = wikiTarget ? (isWikiLinkAvailable?.(wikiTarget) ?? true) : true;
      return (
        <a
          aria-label={wikiTarget && !wikiAvailable ? `Create note ${wikiTarget}` : undefined}
          className={cn(
            "break-words underline underline-offset-4",
            wikiTarget && wikiAvailable && "font-medium text-[var(--theme-primary)] decoration-2 hover:decoration-current",
            wikiTarget && !wikiAvailable && "cursor-pointer text-(--ui-text-quaternary) decoration-current/35",
            !wikiTarget && "text-[var(--theme-primary)] decoration-2 hover:decoration-current",
          )}
          href={href}
          onClick={
            wikiTarget
              ? (event) => {
                  event.preventDefault();
                  onWikiLink?.(wikiTarget);
                }
              : undefined
          }
          rel={wikiTarget ? undefined : "noopener noreferrer"}
          style={{
            color: wikiTarget && !wikiAvailable ? "var(--ui-text-quaternary)" : "var(--theme-primary)",
            textDecorationColor: wikiTarget && !wikiAvailable ? "color-mix(in srgb, currentColor 35%, transparent)" : "currentColor",
            textDecorationLine: "underline",
            textDecorationThickness: wikiTarget && !wikiAvailable ? "1px" : "2px",
            textUnderlineOffset: "0.25rem",
          }}
          target={wikiTarget || !externalLinksInNewTab ? undefined : "_blank"}
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
      <pre className="aui-md-code-block my-2 overflow-x-auto rounded-[0.375rem] border border-border bg-muted/35 p-2.5">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="aui-md-table my-2 max-w-full overflow-x-auto rounded-[0.375rem] border border-border">
        <table className="m-0 w-full min-w-[18rem] border-collapse text-[0.8125rem] [&_tr]:border-b [&_tr]:border-border last:[&_tr]:border-0">
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
  onWikiLink,
  isWikiLinkAvailable,
  externalLinksInNewTab = true,
  obsidianTags = false,
}: {
  className?: string;
  text: string;
  onWikiLink?: (target: string) => void;
  isWikiLinkAvailable?: (target: string) => boolean;
  externalLinksInNewTab?: boolean;
  obsidianTags?: boolean;
}) {
  const markdown = obsidianTags
    ? text.replace(/^\s*tags:\s*\[([^\]]*)\]\s*$/gim, (_line, rawTags: string) => {
        const tags = rawTags.split(",").map((tag) => tag.trim().replace(/^['\"]|['\"]$/g, "")).filter(Boolean);
        return tags.map((tag) => `#${tag.replace(/\s+/g, "-")}`).join(" ");
      })
    : text;
  return (
    <div className={cn(MARKDOWN_CONTAINER_CLASS_NAME, className)}>
      <ReactMarkdown
        components={markdownComponents(onWikiLink, isWikiLinkAvailable, externalLinksInNewTab)}
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkGfm, remarkMath]}
      >
        {normalizeMathDelimiters(onWikiLink ? wikiLinksToMarkdown(markdown) : markdown)}
      </ReactMarkdown>
    </div>
  );
}
