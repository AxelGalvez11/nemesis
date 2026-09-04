// Assistant prose renderer — desktop src/components/assistant-ui/markdown-text.tsx
// (shell spec §B6), ported onto react-markdown + remark-gfm + remark-math +
// rehype-katex. Fenced code renders as a plain mono block, with ONE exception the
// owner ordered on 2026-08-30: a ```mermaid fence renders as the diagram it
// describes — flow charts, mind maps, sequence and state diagrams, in chat.
// See mermaid-diagram.tsx for the gate (parse-first, strict security, and a
// fallback that is byte-identical to the plain block every fence drew before).

import type { Components } from "react-markdown";
import { Children, isValidElement, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
// 🔴🔴🔴 CHEMICAL EQUATIONS. `\ce{2H2 + O2 -> 2H2O}` is how anybody writes a reaction in LaTeX, and
// KaTeX only understands it once this extension has registered itself. It sat unimported in
// `node_modules` the whole time, so every `\ce{…}` the model wrote reached the learner as a red
// `\ce` followed by its own scrambled contents. Measured on the live app, 2026-08-25, twice in one
// answer about an SNAr mechanism.
//
// 🔴 A SIDE-EFFECT IMPORT, AND IT BELONGS BESIDE `rehype-katex`. The extension patches the KaTeX
// singleton rather than exporting anything, so it has to reach the same instance that renders, and
// it has to be loaded before the first render rather than on demand.
import "katex/contrib/mhchem";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { faviconUrl, hostnameOf, sourceLabel } from "@/lib/favicon";
import { cn } from "@/lib/utils";
import { ConceptPill } from "@/components/workspace/concept-pill";
import { citationsToMarkdown, fileRefsToMarkdown, groupCitationRuns, groupFileRuns } from "@/lib/workspace/chat-citations";
import { CONCEPT_HREF } from "@/lib/workspace/concept-terms";
import type { FileCitation } from "@/lib/workspace/chat-citations";
import { obsidianTagsToMarkdown, wikiLinksToMarkdown } from "@/lib/workspace/library-links";
import { escapeCurrencyDollars, normalizeMathDelimiters } from "@/lib/workspace/markdown-math";
import { isMindmapChart, MindmapBlock } from "@/components/workspace/learn/mindmap-block";
import { MermaidDiagram } from "@/lib/workspace/mermaid-diagram";

const MARKDOWN_CONTAINER_CLASS_NAME =
  "aui-md prose w-full max-w-none overflow-hidden text-[length:var(--conversation-text-font-size)] " +
  "leading-(--conversation-line-height) text-foreground " +
  "prose-p:leading-(--conversation-line-height) prose-li:leading-(--conversation-line-height) " +
  "prose-headings:text-foreground prose-strong:text-foreground " +
  "prose-a:break-words prose-p:[overflow-wrap:anywhere] " +
  "prose-li:marker:text-muted-foreground/70 " +
  "prose-code:font-mono prose-code:font-normal " +
  "prose-code:before:content-none prose-code:after:content-none " +
  // Inline code was typography-plugin default — in dark mode that computes to
  // near-black on black (owner 2026-08-04: "dark mode has some text that isnt
  // legible"). Pin it to the app's own tokens in both themes.
  "prose-code:text-foreground prose-code:bg-(--ui-bg-quaternary) " +
  // 🔴 SIZE, RADIUS, PADDING AND EVERY BLOCK GAP LIVE IN desktop-chrome.css NOW, under
  // `.aui-md.aui-md`, because they are measured against the reference and a measurement belongs
  // beside the note that records it. Four utilities were removed from this string rather than left
  // to lose a specificity fight in silence: `prose-code:rounded-[0.25rem]`,
  // `prose-code:px-[0.1875rem]`, `prose-code:text-[0.9em]` and `[&>*+*]:mt-(--paragraph-gap)`.
  // Every one of them was ALSO wrong by the rem trap — this app's root font is 18px, so
  // `0.25rem` drew a 4.5px corner where the reference has 4, and `--paragraph-gap: 0.89rem`
  // drew 16.02px. The two first/last-child resets stay: they are structural, not measured.
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0";

const CODE_BLOCK_LANGUAGE_RE = /language-/;

/**
 * A fenced code block, with the header the reference puts on one.
 *
 * 🔴 MEASURED IN THE OWNER'S ACCOUNT 2026-08-31, on a fence ChatGPT wrote to order: a header strip
 * carrying the language and a copy control, then the code at 12.25px on a 20px line with 20px of
 * side padding and 12px underneath. No border and no filled box around the whole thing — the strip
 * is what separates it from the prose.
 *
 * 🔴 THE COPY CONTROL IS THE POINT OF THE STRIP, NOT DECORATION. A code block a learner cannot copy
 * is a picture of code. Theirs also carries a Run button; that executes code and is a feature this
 * app has not been asked for, so it is deliberately absent rather than faked.
 *
 * 🔴 `aria-live` ON THE LABEL, NOT A TOAST. The confirmation has to be announced where the action
 * happened, and a screen reader that hears nothing after a copy cannot tell whether it worked.
 */
function CodeBlock({ children, language }: { children: React.ReactNode; language: string | null }) {
  const [copied, setCopied] = useState(false);
  const body = useRef<HTMLPreElement | null>(null);

  const copy = async () => {
    const text = body.current?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // A browser that refuses the clipboard leaves the label alone: claiming a copy that did not
      // happen is worse than saying nothing, because the learner pastes stale content.
    }
  };

  return (
    <div className="aui-md-code-block my-2 overflow-hidden rounded-[6px]">
      <div className="flex items-center justify-between gap-2 bg-(--ui-bg-quaternary) py-[6px] pl-[20px] pr-[8px]">
        <span className="font-mono text-[12px] text-(--ui-text-tertiary)">{language ?? "code"}</span>
        <button
          aria-live="polite"
          className="flex h-[28px] items-center gap-[6px] rounded-[6px] px-[8px] text-[12px] text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-secondary)"
          onClick={() => void copy()}
          type="button"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {/* 🔴 `!my-0`: the typography plugin gives `pre` a margin of its own, which opened a visible
          band between the header strip and the code and made one block read as two. */}
      <pre className="!my-0 overflow-x-auto bg-(--ui-bg-quaternary) px-[20px] pb-[12px] pt-[8px] text-foreground" ref={body}>
        {children}
      </pre>
    </div>
  );
}


/** A web result the answer can cite. Structural, so SessionSource fits as-is. */
export interface CitationSource {
  title: string;
  url: string;
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

export function markdownComponents(
  onWikiLink?: (target: string) => void,
  isWikiLinkAvailable?: (target: string) => boolean,
  externalLinksInNewTab = true,
  sources?: ReadonlyArray<CitationSource>,
  /** Draw citations as ChatGPT does: favicon + site name + "+N". See the branch that reads it. */
  namedCitations = false,
  /** The learner's attached documents, so a file pill can name the one it opens. */
  files?: ReadonlyArray<FileCitation>,
  /** Open one of them. Absent on surfaces with no reading pane, which keeps the pill inert there. */
  onOpenFile?: (file: FileCitation) => void,
): Components {
  return {
    a: ({ children, href, title }) => {
      // A key term the model marked (lib/workspace/concept-terms.ts): a pill with its meaning.
      if (href === CONCEPT_HREF || href?.startsWith(`${CONCEPT_HREF} `)) {
        return <ConceptPill meaning={title ?? ""}>{children}</ConceptPill>;
      }
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
      // 🔴🔴 A CITATION OF THE LEARNER'S OWN MATERIAL, WHICH HAD NO WAY TO EXIST UNTIL 2026-09-01.
      // Owner, comparing his canvas with ChatGPT's answer to the same two uploads: ChatGPT pinned
      // about fifteen chips to specific claims and ours pinned none, because every pill below is
      // built on `source.url` — a favicon, a hostname, an external link — and a lecture the learner
      // dropped in has none of those. It is not a web result with a missing field; it is a
      // different kind of thing, and it gets its own treatment rather than a hollowed-out one.
      //
      // 🔴 IT IS NOT A LINK. There is nowhere on the public internet to send anyone, and a pill
      // that looks clickable and goes nowhere is worse than one that plainly does not. The
      // document's name is in the pill and in the tooltip; opening it belongs to the sources panel,
      // which already does that job.
      const fileRef = href?.startsWith("#nemesis-file=")
        ? href.slice("#nemesis-file=".length).split(".")[0]
        : null;
      if (fileRef) {
        const extra = Number.parseInt(href!.slice("#nemesis-file=".length).split(".")[1] ?? "0", 10) || 0;
        const name = typeof children === "string" ? children : String(children ?? fileRef);
        // 🔴🔴🔴 IT OPENS NOW, AND THE COMMENT ABOVE EXPLAINS WHY IT DID NOT. "There is nowhere on
        // the public internet to send anyone" was true and is not the question: the destination is
        // the reading pane on this surface, which has held several documents at once since #913 and
        // which nothing in an answer could reach. Measured on production 2026-09-03: every file pill
        // rendered as a `<span>` with `cursor: auto`, so the only gesture a learner would try —
        // click the document a sentence cites — did nothing at all.
        //
        // 🔴 STILL INERT WHERE THERE IS NO PANE. `onOpenFile` is absent in the Library reader and
        // anywhere else this renderer is used, and a pill that looks clickable and goes nowhere is
        // worse than one that plainly does not — which is the half of the original note that stands.
        const file = onOpenFile ? files?.find((candidate) => candidate.id === fileRef) : undefined;
        const shell =
          "mx-[2px] inline-flex h-[18px] max-w-[220px] translate-y-[4px] items-center gap-[3px] rounded-[12px] bg-(--ui-bg-tertiary) pl-[5px] pr-[6px] align-baseline text-[9px] font-medium leading-none text-(--ui-text-secondary)";
        if (file && onOpenFile) {
          return (
            <button
              className={`${shell} cursor-pointer transition-colors hover:bg-(--ui-bg-elevated) hover:text-(--ui-text-primary)`}
              data-cite-file={fileRef}
              onClick={() => onOpenFile(file)}
              title={extra > 0 ? `Open ${name} and ${extra} more` : `Open ${name}`}
              type="button"
            >
              <svg aria-hidden="true" className="size-[10px] shrink-0" fill="none" viewBox="0 0 12 12">
                <path d="M3 1.25h3.5L9.25 4v6.75H3z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.1" />
                <path d="M6.5 1.25V4h2.75" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.1" />
              </svg>
              <span className="truncate">{name}</span>
              {extra > 0 && <span className="shrink-0 opacity-70">+{extra}</span>}
            </button>
          );
        }
        return (
          <span
            className={shell}
            data-cite-file={fileRef}
            title={extra > 0 ? `${name} and ${extra} more` : name}
          >
            {/* A page with a folded corner: the one mark that reads as "a document you added"
                without needing a brand behind it. 10px to sit inside the 18px pill. */}
            <svg aria-hidden="true" className="size-[10px] shrink-0" fill="none" viewBox="0 0 12 12">
              <path d="M3 1.25h3.5L9.25 4v6.75H3z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.1" />
              <path d="M6.5 1.25V4h2.75" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.1" />
            </svg>
            <span className="truncate">{name}</span>
            {extra > 0 && <span className="shrink-0 opacity-70">+{extra}</span>}
          </span>
        );
      }
      const citeIndex = href?.startsWith("#nemesis-cite=")
        ? Number.parseInt(href.slice("#nemesis-cite=".length), 10)
        : null;
      // 🔴 `n.extra` — HOW MANY MORE SOURCES THIS ONE PILL STANDS FOR. `groupCitationRuns` collapses
      // a run of adjacent markers into one, and `Number.parseInt` above stops at the dot, so a
      // renderer that never learned about this still resolves the leading source correctly.
      const citeExtra = href?.startsWith("#nemesis-cite=")
        ? Number.parseInt(href.slice("#nemesis-cite=".length).split(".")[1] ?? "0", 10) || 0
        : 0;
      if (citeIndex !== null) {
        const source = sources?.[citeIndex - 1];
        // Pre-processing only emits in-range markers, so a miss means stale
        // markup (an edited/replayed answer) — drop the chip rather than leave
        // a bare number sitting in the prose.
        if (!source) return null;
        const host = hostnameOf(source.url);
        // 🔴 PINNED IN PIXELS ON PURPOSE (owner 2026-08-03: "they should be
        // smaller"; 2026-08-04: "still too big"). The app's text-size dial IS
        // the root font-size, so em/rem here scale with it. Second shrink
        // dropped the site-name text entirely: a citation is now a favicon
        // dot the height of the surrounding text — the name lives in the
        // tooltip and in alt text, not in the prose.
        const label = sourceLabel(source.url) ?? host;
        const tooltip = source.title ? `${source.title} — ${label ?? source.url}` : source.url;

        // 🔴🔴 THE NAMED PILL IS OPT-IN, AND BOTH SHAPES ARE THE OWNER'S OWN INSTRUCTION AT
        // DIFFERENT TIMES. On 2026-08-03 and again on 08-04 he asked for these smaller, twice, and
        // the second pass dropped the site name entirely — a citation on the CHAT surface has been
        // a bare favicon dot ever since, and nothing about that has been withdrawn.
        //
        // On 2026-08-20, after measuring ChatGPT side by side, he asked for the Canvas to match it:
        // 62x18px, radius 12px, a 12px favicon and the site name at 9px on a flat grey fill with no
        // border. That is SMALLER in height than what he complained about and carries the name.
        //
        // 🔴 SO IT IS A PROP RATHER THAN A REWRITE. Defaulting to the dot leaves every existing
        // caller exactly as it was; the Canvas passes `namedCitations` and gets the reference. One
        // renderer, two measured treatments, and no surface changes shape because another one did.
        if (namedCitations && label) {
          return (
            <a
              className="mx-[2px] inline-flex h-[18px] translate-y-[4px] items-center gap-[3px] rounded-[12px] bg-(--ui-bg-tertiary) pl-[3px] pr-[6px] align-baseline text-[9px] font-medium leading-none text-(--ui-text-secondary) no-underline hover:bg-(--ui-control-hover-background)"
              href={source.url}
              rel="noopener noreferrer"
              target="_blank"
              title={tooltip}
            >
              {host && (
                // eslint-disable-next-line @next/next/no-img-element -- remote favicon service, not a static asset.
                <img alt="" className="size-[12px] shrink-0 rounded-full" src={faviconUrl(host)} />
              )}
              {label}
              {citeExtra > 0 && <span className="text-(--ui-text-quaternary)">+{citeExtra}</span>}
            </a>
          );
        }

        return (
          <a
            className="mx-[2px] inline-flex size-[16px] translate-y-[3px] items-center justify-center rounded-full border border-(--ui-stroke-tertiary) bg-(--ui-bg-secondary) align-baseline no-underline hover:bg-(--ui-control-hover-background)"
            href={source.url}
            rel="noopener noreferrer"
            target="_blank"
            title={tooltip}
          >
            {host ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote favicon service, not a static asset.
              <img alt={label ?? host} className="size-[12px] rounded-full" src={faviconUrl(host)} />
            ) : (
              <span className="text-[9px] leading-none font-medium text-(--ui-text-tertiary)">{citeIndex}</span>
            )}
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
          // 🔴 `!bg-transparent !p-0`: the `prose-code:` rules at the top of this file dress INLINE code
        // as a chip — a background and a little padding — and they apply to fenced code too. Inside
        // the block that painted a lighter band behind the text, ending mid-line, which read as a
        // highlight nobody asked for.
        <code
          className={cn("block overflow-x-auto whitespace-pre !bg-transparent !p-0 font-mono text-[12.25px] leading-[20px]", className)}
          {...props}
        >
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
    // 🔴🔴 THE MARGINS, NOT THE SIZES, WERE WHY A HEADING DID NOT READ AS ONE. Owner, 2026-09-01,
    // comparing an answer of ours with ChatGPT's: *"it has like more bold words and it has the line
    // breaks and the headings… it's just easier to read."* Every heading here carried `my-1` — 4.5px
    // at this root font — so a section title sat the same distance from the paragraph above it as
    // from its own body, and the eye had nothing to group on. The sizes were already correct.
    //
    // Numbers are ChatGPT's own, measured in the owner's account and recorded in
    // docs/chatgpt-reference.md: h1 24/600/32 with `0 0 8px`, h2 20/600/28 and h3 18/600/28 with
    // `16px 0 4px`. A heading belongs to what FOLLOWS it, which is why the space above is four
    // times the space below.
    //
    // 🔴 PIXELS, NOT TAILWIND STEPS. This app's root font is 112.5%, so `mt-4` is 18px and not 16 —
    // the trap this repo has fallen into six times. Anything measured against a reference is
    // written here as the measurement.
    h1: ({ children }) => <h1 className="mb-[8px] mt-[24px] text-[24px] font-semibold leading-[32px] tracking-tight first:mt-0" id={slugifyHeading(headingText(children))}>{children}</h1>,
    h2: ({ children }) => <h2 className="mb-[4px] mt-[16px] text-[20px] font-semibold leading-[28px] tracking-tight first:mt-0" id={slugifyHeading(headingText(children))}>{children}</h2>,
    h3: ({ children }) => <h3 className="mb-[4px] mt-[16px] text-[18px] font-semibold leading-[28px] first:mt-0" id={slugifyHeading(headingText(children))}>{children}</h3>,
    h4: ({ children }) => <h4 className="mb-[4px] mt-[16px] text-[16px] font-semibold leading-[24px] first:mt-0" id={slugifyHeading(headingText(children))}>{children}</h4>,
    hr: () => <hr className="my-5 border-0 border-t border-(--ui-stroke-secondary)" />,
    img: ({ alt, src }) =>
      typeof src === "string" ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote/blob markdown images, not a static asset.
        <img alt={alt ?? ""} className="max-w-full rounded-[0.375rem]" src={src} />
      ) : null,
    li: ({ children }) => <li className="leading-(--conversation-line-height)">{children}</li>,
    ol: ({ children }) => (
      <ol className="my-1 gap-0" dir="auto">
        {children}
      </ol>
    ),
    p: ({ children }) => <p className="wrap-anywhere leading-(--conversation-line-height)">{children}</p>,
    pre: ({ children }) => {
      // 🔴 A ```mermaid FENCE IS A DIAGRAM, NOT A CODE BLOCK (owner, 2026-08-30: "flow charts,
      // diagrams, graphs, mind maps in chat"). Routed here rather than in `code` because the
      // diagram must replace the WHOLE block — a drawing inside the mono box would wear a border
      // and a code background it never asked for. Every other fence renders exactly as before.
      const only = Children.toArray(children)[0];
      if (isValidElement(only)) {
        const fence = only.props as { className?: string; children?: unknown };
        if (/language-mermaid/.test(fence.className ?? "")) {
          const chart = typeof fence.children === "string" ? fence.children : String(fence.children ?? "");
          // 🔴 A MIND MAP IS THE ONE DIAGRAM A LEARNER CLIMBS RATHER THAN READS (owner 2026-09-03:
          // "one that I can click on and then reveals more nodes"), so it goes to the interactive
          // tree; every other mermaid shape still draws through the engine. See mindmap-block.tsx.
          if (isMindmapChart(chart)) return <MindmapBlock chart={chart} />;
          return <MermaidDiagram chart={chart} />;
        }
      }
      // 🔴 THE FENCE'S LANGUAGE IS THE HEADER'S LABEL, and it is read from the same className the
      // `code` renderer above keys on, so the two can never disagree about what a fence is.
      const language = isValidElement(only)
        ? /language-([\w+-]+)/.exec(((only.props as { className?: string }).className ?? ""))?.[1] ?? null
        : null;
      return <CodeBlock language={language}>{children}</CodeBlock>;
    },
    // 🔴🔴 UNBOXED, AND THAT IS THE REFERENCE'S OWN SHAPE. Measured in the owner's account
    // 2026-08-31: their table has NO wrapper border, NO radius and NO shaded header. It is 14px
    // text with two hairlines — a firmer one under the header, a fainter one under each row — and
    // the first column sits flush with the prose above it, with the 24px of gap on the RIGHT of
    // each cell instead. A bordered card with a grey header band reads as a widget dropped into
    // the answer; theirs reads as part of the sentence that introduced it.
    //
    // 🔴 THE SCROLL WRAPPER STAYS. A wide table must never make the whole answer scroll sideways
    // (globals.css states that rule for the note editor and it holds here). What went is the
    // border and the radius on it, not the container.
    table: ({ children }) => (
      <div className="aui-md-table my-2 max-w-full overflow-x-auto">
        {/* !m-0: typography's table margin survives a bare m-0 here. */}
        <table className="!m-0 w-full min-w-[18rem] border-collapse text-[14px]">{children}</table>
      </div>
    ),
    // 🔴 PIXELS, AND NO LEFT PADDING. `px-2.5` is 11.25px at this app's 112.5% root and pads BOTH
    // sides, which pushes the first column off the prose column it should line up with. Theirs is
    // 10px above and below, 24px to the right, nothing to the left.
    td: ({ children }) => (
      <td className="border-b border-(--ui-stroke-tertiary) py-[10px] pr-[24px] align-top leading-normal">{children}</td>
    ),
    th: ({ children }) => (
      <th className="whitespace-nowrap border-b border-(--ui-stroke-secondary) py-[8px] pr-[24px] text-left align-middle font-semibold text-foreground">
        {children}
      </th>
    ),
    thead: ({ children }) => <thead className="m-0">{children}</thead>,
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
  files,
  onWikiLink,
  isWikiLinkAvailable,
  externalLinksInNewTab = true,
  obsidianHighlights = false,
  obsidianTags = false,
  obsidianUnderline = false,
  htmlSubSup = false,
  singleDollarMath = false,
  namedCitations = false,
  onOpenFile,
}: {
  className?: string;
  text: string;
  /** Numbered web results backing this answer. Supplying them turns the answer's
   *  [n] markers into inline source pills; omitting them leaves the text as-is. */
  sources?: ReadonlyArray<CitationSource>;
  /** Documents the learner attached, which the answer can cite by excerpt id (`[s1:e4]`).
   *  Supplying them turns those markers into file pills; omitting them DELETES the markers, on
   *  the same rule as `[n]`: a marker with nothing behind it is never printed. */
  files?: ReadonlyArray<FileCitation>;
  /**
   * Open one of those documents. Supplying it makes every file pill a real button.
   *
   * 🔴 A PROP, NOT A CONTEXT READ, BECAUSE OF WHERE THIS FILE LIVES. The reading pane's state is a
   * React context owned by the canvas; reaching into it from `lib/workspace` would make a generic
   * markdown renderer depend on one surface's component tree. The canvas passes this in, the
   * Library reader does not, and the pill stays inert exactly where there is nothing to open.
   */
  onOpenFile?: (file: FileCitation) => void;
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
  /** Treat `$x$` as inline math. OFF by default so model prose like
   *  "$0.20 per million input tokens and $1.20" stays money, not italics
   *  (owner screenshot 2026-08-04). Note surfaces turn it on — Obsidian
   *  users write `$x$` on purpose. `$$x$$`, `\(x\)` and `\[x\]` render as
   *  math in BOTH modes (normalizeMathDelimiters emits the $$ forms).
   *  Where it IS on, escapeCurrencyDollars still holds prices back, so turning
   *  it on no longer costs you "$0.87 to $3.96" (owner screenshot 2026-08-20). */
  singleDollarMath?: boolean;
  /**
   * Render each citation as a favicon + site name pill with a "+N" for a collapsed run, measured
   * off ChatGPT on 2026-08-20 (62x18px, radius 12px, 12px favicon, 9px name, flat grey, no border).
   *
   * 🔴 OFF BY DEFAULT, WHICH KEEPS THE CHAT SURFACE EXACTLY AS THE OWNER ASKED FOR IT TWICE IN
   * AUGUST — a bare dot, name in the tooltip. The Canvas turns it on because he asked for that
   * surface to match the reference. Two measured treatments, one renderer, neither imposed on the
   * other.
   */
  namedCitations?: boolean;
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
  // 🔴 GROUPED ONLY WHERE THE PILL CAN SAY "+N". A collapsed run rendered as a bare dot would
  // silently DROP the other sources from the prose — the reader would see one dot where two pages
  // were cited and have no way to know. The named pill can say so; the dot cannot, so it does not
  // collapse.
  const cited = namedCitations
    ? groupCitationRuns(citationsToMarkdown(markdown, sources?.length ?? 0))
    : citationsToMarkdown(markdown, sources?.length ?? 0);
  // 🔴 AFTER THE WEB PASS, AND THE ORDER DOES NOT MATTER FOR CORRECTNESS — the two patterns are
  // disjoint (`[1]` is bare digits, this needs `sN:eN`) and chat-citations.test.ts asserts that in
  // both directions. It runs second only so a future reader meets them in the order the model
  // learned them.
  //
  // 🔴 ALWAYS, NOT GATED ON `namedCitations`. A file pill has no dot form to fall back to: the
  // whole point is the document's NAME, so there is no second treatment to choose between. And
  // running it unconditionally is what makes "a stray excerpt id never reaches the screen" true on
  // every surface rather than on the ones that opted in.
  const grounded = groupFileRuns(fileRefsToMarkdown(cited, files ?? []));
  const linked = onWikiLink ? wikiLinksToMarkdown(grounded) : grounded;
  // 🔴 A PRICE IS NOT A FORMULA. With single-dollar math on, remark-math pairs the two `$` in
  // "$0.87 to $3.96" into one italic run — the owner's screenshot, twice. Guarding here rather
  // than turning the flag off keeps `$k$` and `$x^2$` working on the surfaces that asked for them.
  const guarded = singleDollarMath ? escapeCurrencyDollars(linked) : linked;

  // 🔴🔴 MEMOISED, NOT REBUILT EVERY RENDER — THIS IS WHY VOICE PLAYBACK MADE THE ANSWER FLICKER
  // (owner, 2026-08-26: "turning on read out loud makes the text flicker on and off"). Verified in
  // `hast-util-to-jsx-runtime` (what `ReactMarkdown` renders through): for a tag like `p` it does
  // `type = state.components.p ?? "p"`, then creates the element as `jsx(type, props, key)` —
  // the exact FUNCTION REFERENCE becomes the element's `type`. Every entry `markdownComponents`
  // returns (`p`, `a`, `li`, `h1`…) was a fresh closure on every call, and this call sat inline in
  // the JSX below, so every render of `AssistantMarkdown` built a brand new one. React remounts
  // rather than updates when an element's `type` changes, even at an unchanged `key` — so every
  // paragraph and heading in an answer was torn down and rebuilt on every render of whatever
  // renders this component.
  //
  // On the Canvas that happens continuously while an answer is playing: `useResponseAudio`'s
  // `<audio>` fires `ontimeupdate`/`onprogress` several times a second, those handlers live in the
  // same component that renders the reply, and each tick re-rendered this markdown and remounted
  // it — replaying `.canvas-answer-in`'s fade-in (`globals.css`, `canvas-answer-block`) on every
  // node, over and over, for as long as the audio kept ticking. That reads as the text blinking on
  // and off. Memoising on the inputs that should actually change the output means an unrelated
  // re-render (a playback tick, a composer keystroke) reuses the same function references, so React
  // updates the existing nodes in place instead of replacing them — and the fade-in, which is
  // `animation: … both` and already holds at its end state, is never told to start over. A genuinely
  // new answer still mounts fresh and still fades in: the key on the wrapping `<div>` in
  // `learning-canvas.tsx` is unchanged, and mounting is exactly when this animation is meant to run.
  const components = useMemo(
    () => markdownComponents(onWikiLink, isWikiLinkAvailable, externalLinksInNewTab, sources, namedCitations, files, onOpenFile),
    // 🔴 `files` AND `onOpenFile` BELONG HERE, AND BOTH ARE STABLE BY CONSTRUCTION AT THE CALL
    // SITE — `citableFiles` is a `useMemo` over `canvas.sources`, `onOpenFile` a `useCallback`.
    // Omitting them would freeze the first render's values into every later one, which for a pill
    // means clicking it opens whatever document happened to be cited when the answer first mounted.
    // Including unstable ones would restart the fade-in on every keystroke, which is what the note
    // above is protecting.
    [onWikiLink, isWikiLinkAvailable, externalLinksInNewTab, sources, namedCitations, files, onOpenFile],
  );

  return (
    <div className={cn(MARKDOWN_CONTAINER_CLASS_NAME, className)}>
      <ReactMarkdown
        components={components}
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: singleDollarMath }]]}
      >
        {normalizeMathDelimiters(guarded)}
      </ReactMarkdown>
    </div>
  );
}
