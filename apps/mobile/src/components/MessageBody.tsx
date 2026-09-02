import { useMemo, type ReactNode } from "react";
import { Image, Linking, StyleSheet, Text, View } from "react-native";
import Markdown from "react-native-markdown-display";
import type { ASTNode } from "react-native-markdown-display";
import MarkdownIt from "markdown-it";
import { MathJaxSvg } from "react-native-mathjax-html-to-svg";

import { MarkdownImage } from "./MarkdownImage";
import type { ChatSource } from "@/lib/chat-thread";
import { FILE_PILL_PREFIX, WEB_PILL_PREFIX, webCitationFaviconUrl, webCitationLabel } from "@/lib/citation-pills";
import { obsidianInline } from "@/lib/markdown-obsidian";
import type { ThreadSource } from "@/learn/web";
import { createMarkdownStyles } from "@/theme/markdown";
import { useTheme } from "@/theme/ThemeProvider";
import { type as typeScale } from "@/theme/tokens";

// MessageBody: the assistant answer renderer. The overwhelming common case is
// prose with NO math — that path renders EXACTLY as before, a single
// react-native-markdown-display block (zero regression). Only when the text
// actually carries LaTeX/math do we split it into ordered pieces: plain prose
// still goes through the real Markdown renderer (so headings, lists, tables,
// bold, code all survive), while math is drawn as SVG by
// react-native-mathjax-html-to-svg (pure JS, no webview).
//
// Delimiters (MathJaxSvg's own config, mirrored by our splitter):
//   display  $$…$$   \[…\]   → a centered block
//   inline   \(…\)   $…$     → drawn on the line, so text + math stay together
//
// Robustness: if the math delimiters don't balance, we bail and render the whole
// message as plain Markdown rather than emit something garbled. A lone `$` is
// treated as currency (not math) unless it passes the guard in matchDollarMath.

// Callers may scale a tier — the flashcard prompt enlarges `body` and centers
// its text — so accept any object per key rather than the literal types
// createMarkdownStyles infers, which would otherwise lock those callers out.
type MarkdownStyles = { [K in keyof ReturnType<typeof createMarkdownStyles>]: object };

// Match the Markdown body size so inline math sits at the same scale as prose.
const MATH_FONT_SIZE = 15.5;

// Render `![](url)` through MarkdownImage instead of the library's built-in
// rule, which hands a remote URL to <Image> with no dimensions — and a remote
// <Image> with no width/height collapses to zero in React Native, so the
// picture never appears. MarkdownImage measures first, then draws. Shared by
// both <Markdown> call sites below so chat answers and flashcards behave the
// same way.
// One parser for every surface, carrying the Obsidian-flavoured inline rules
// the web note editor renders — ==highlight==, #tag, <u>underline</u>. `html`
// stays FALSE: note text syncs from the cloud, so enabling raw HTML would let
// a note inject arbitrary markup. markdown-obsidian.ts handles the single tag
// we actually author instead of opening that door.
const MARKDOWN_PARSER = MarkdownIt({ typographer: false, linkify: true, html: false }).use(obsidianInline);

const MARKDOWN_RULES = {
  image: (node: ASTNode) => (
    <MarkdownImage
      key={node.key}
      src={String(node.attributes?.src ?? "")}
      alt={typeof node.attributes?.alt === "string" ? node.attributes.alt : undefined}
    />
  ),
  // Inline marks: return <Text> so they nest inside a paragraph's textgroup
  // rather than breaking it into blocks.
  mark: (node: ASTNode, children: ReactNode, _parent: unknown, styles: MarkdownStyles) => (
    <Text key={node.key} style={styles.mark}>{children}</Text>
  ),
  tag: (node: ASTNode, children: ReactNode, _parent: unknown, styles: MarkdownStyles) => (
    <Text key={node.key} style={styles.tag}>{children}</Text>
  ),
  u: (node: ASTNode, children: ReactNode, _parent: unknown, styles: MarkdownStyles) => (
    <Text key={node.key} style={styles.u}>{children}</Text>
  ),
};

type Segment =
  | { type: "markdown"; text: string }
  | { type: "display"; tex: string }
  | { type: "inline"; text: string };

interface MessageBodyProps {
  content: string;
  styles: MarkdownStyles;
  /** The note reader routes [[wikilinks]] and external URLs through its own
   *  handler; chat and review leave this off and get default link handling. */
  onLinkPress?: (url: string) => boolean;
  /** Known answer sources. Matching markdown links become compact inline
   * citation chips, like the iOS ChatGPT source treatment. */
  sources?: ChatSource[];
  /** The canvas turn's web results, in the numbering the model was shown — resolves a
   *  `groundedReplyMarkdown`-produced `#nemesis-cite=n` pill to a favicon + host/title. A
   *  DIFFERENT list from `sources` above: that one matches a markdown link's literal URL, this one
   *  is looked up by POSITION (`webSources[n-1]`), the only correct way to resolve `[n]` — see
   *  `citation-pills.ts`'s header for why the answer-order list must never be used for this. */
  webSources?: readonly ThreadSource[];
}

export function MessageBody({ content, styles, onLinkPress, sources, webSources }: MessageBodyProps) {
  const { colors: c } = useTheme();
  const segments = useMemo(() => buildSegments(content), [content]);
  // 🔴 CHEAP AND TARGETED, RATHER THAN "ALWAYS BUILD A CUSTOM LINK RULE". `citation-pills.ts`'s
  // `groundedReplyMarkdown` is the only thing that ever writes either substring, and only the
  // canvas turn calls it before handing `content` here — every other of this component's ~12 call
  // sites (the note reader, flashcard review, the notebook thread…) passes plain content and must
  // keep getting the library's own default link renderer, unchanged. Scanning for the markers is
  // what lets this stay additive instead of risking a regression across all of them.
  const hasPills = content.includes("(" + FILE_PILL_PREFIX) || content.includes("(" + WEB_PILL_PREFIX);
  const rules = useMemo(() => {
    if (!sources?.length && !hasPills) return MARKDOWN_RULES;
    const sourceUrls = new Set((sources ?? []).map((source) => normalizedUrl(source.url)));
    return {
      ...MARKDOWN_RULES,
      link: (node: ASTNode, children: ReactNode) => {
        const href = String(node.attributes?.href ?? "");
        // 🔴 A CITATION, NOT A LINK TO US. `groundedReplyMarkdown` already resolved this marker to
        // a source this canvas actually holds — the label IS the document's title, same rule
        // `source-pill.ts` states for the web. There is nowhere to send a tap (no onPress, no
        // `Linking`): the web's own `chat-markdown.tsx` draws the identical marker as a plain,
        // non-interactive `<span>` for exactly this reason, and this mirrors that rather than
        // inventing a destination. `.extra` (from a collapsed run, `groupFileRuns`) prints as "+N".
        if (href.startsWith(FILE_PILL_PREFIX)) {
          const extra = Number.parseInt(href.slice(FILE_PILL_PREFIX.length).split(".")[1] ?? "0", 10) || 0;
          return (
            <Text key={node.key} style={[groundedCitation.pill, { backgroundColor: c.surface2, color: c.text }]}>
              {"\u{1F4C4} "}
              {children}
              {extra > 0 ? ` +${extra}` : ""}
            </Text>
          );
        }
        // 🔴 A LIVE PAGE, WHICH DOES OPEN — unlike the file pill above, `chat-markdown.tsx` sends
        // this one to `source.url` (`target="_blank"`) because a web page already has an address
        // to send a reader to. `citeIndex` is 1-based and resolved by POSITION against
        // `webSources`, never by matching the href's digits against anything else — see
        // `citation-pills.ts`'s header for why an answer-order list would attribute this to the
        // wrong page. Out of range (a stale/replayed answer) drops the chip rather than a bare
        // number, the same rule a missing file source follows.
        if (href.startsWith(WEB_PILL_PREFIX)) {
          const rest = href.slice(WEB_PILL_PREFIX.length);
          const citeIndex = Number.parseInt(rest, 10);
          const extra = Number.parseInt(rest.split(".")[1] ?? "0", 10) || 0;
          const source = webSources?.[citeIndex - 1];
          if (!source) return null;
          const label = webCitationLabel(source.url) ?? source.title;
          const favicon = webCitationFaviconUrl(source.url);
          return (
            <Text
              accessibilityRole="link"
              key={node.key}
              onPress={() => void Linking.openURL(source.url).catch(() => {})}
              style={[groundedCitation.pill, { backgroundColor: c.surface2, color: c.text }]}
            >
              {favicon ? <Image source={{ uri: favicon }} style={groundedCitation.favicon} /> : null}
              {label ? ` ${label}` : ""}
              {extra > 0 ? ` +${extra}` : ""}
            </Text>
          );
        }
        const isSource = sourceUrls.has(normalizedUrl(href));
        return (
          <Text
            accessibilityRole="link"
            key={node.key}
            onPress={() => {
              const handled = onLinkPress?.(href) ?? false;
              if (!handled) void Linking.openURL(href).catch(() => {});
            }}
            style={isSource
              ? [inlineCitation.chip, { backgroundColor: c.surface2, color: c.textHint }]
              : styles.link}
          >
            {children}
          </Text>
        );
      },
    };
  }, [c.surface2, c.text, c.textHint, hasPills, onLinkPress, sources, styles, webSources]);

  // No real math (or unbalanced delimiters → fallback): render the message as a
  // single plain Markdown block with NO wrapper, byte-identical to before.
  if (!segments) {
    return <Markdown style={styles} rules={rules} markdownit={MARKDOWN_PARSER} onLinkPress={onLinkPress}>{content}</Markdown>;
  }

  return (
    <View style={mathLayout.stack}>
      {segments.map((seg, index) => {
        if (seg.type === "markdown") {
          return (
            <Markdown key={index} style={styles} rules={rules} markdownit={MARKDOWN_PARSER} onLinkPress={onLinkPress}>
              {seg.text}
            </Markdown>
          );
        }
        if (seg.type === "display") {
          return (
            <View key={index} style={mathLayout.display}>
              <MathJaxSvg fontSize={MATH_FONT_SIZE} color={c.text}>
                {seg.tex}
              </MathJaxSvg>
            </View>
          );
        }
        return (
          <MathJaxSvg key={index} fontSize={MATH_FONT_SIZE} color={c.text} style={mathLayout.inline}>
            {seg.text}
          </MathJaxSvg>
        );
      })}
    </View>
  );
}

function normalizedUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

const inlineCitation = StyleSheet.create({
  chip: {
    borderRadius: 999,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 5,
    paddingVertical: 2,
    textDecorationLine: "none",
  },
});

// The pill for a GROUNDED citation — a document excerpt (`#nemesis-file=`) or a live web result
// (`#nemesis-cite=`) — as distinct from `inlineCitation` above, which is the older bare-URL-match
// chip. Measured off the web's own file chip (`chat-markdown.tsx`'s `fileRef` span: rounded-full,
// `bg-(--ui-bg-tertiary)`, `text-(--ui-text-secondary)`) but restated in the phone's own terms per
// the owner's screenshot of the first pass, which came out green and underlined: a rounded grey
// box in `colors.text` (not the accent/link colour), `type.micro` (13pt), no underline.
const groundedCitation = StyleSheet.create({
  favicon: { borderRadius: 3, height: 12, marginRight: 2, width: 12 },
  pill: {
    borderRadius: 6,
    fontSize: typeScale.micro.fontSize,
    fontWeight: typeScale.micro.fontWeight,
    lineHeight: typeScale.micro.lineHeight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    textDecorationLine: "none",
  },
});

// Returns the ordered segments, or null when the message should render as one
// plain Markdown block: either there is no real math, or a structural delimiter
// is unbalanced (the fallback).
function buildSegments(content: string): Segment[] | null {
  // Fast path: nothing that could open math → straight to Markdown.
  if (!content.includes("$") && !content.includes("\\(") && !content.includes("\\[")) {
    return null;
  }

  const parts = splitDisplay(content);
  if (!parts) return null; // unbalanced $$ or \[ … \]

  const segments: Segment[] = [];
  let sawMath = false;
  for (const part of parts) {
    if (part.type === "display") {
      segments.push({ type: "display", tex: part.value });
      sawMath = true;
      continue;
    }
    const inlineSegs = splitInline(part.value);
    if (!inlineSegs) return null; // unbalanced \( … \)
    for (const seg of inlineSegs) {
      if (seg.type === "inline") sawMath = true;
      // Drop whitespace-only Markdown chunks (e.g. the gap between two display
      // blocks) so they don't add stray paragraph margins.
      if (seg.type === "markdown" && !seg.text.trim()) continue;
      segments.push(seg);
    }
  }

  // Only currency `$` and the like — no actual math survived. Fall back to the
  // single plain Markdown block so the tree stays identical to today.
  if (!sawMath) return null;
  return segments;
}

type DisplayPart = { type: "text"; value: string } | { type: "display"; value: string };

// Pull display math ($$…$$ and \[…\]) out as its own parts; everything else is
// text to be handled inline. Returns null if an opener has no matching close.
function splitDisplay(content: string): DisplayPart[] | null {
  const parts: DisplayPart[] = [];
  let text = "";
  let i = 0;
  const flushText = () => {
    if (text) {
      parts.push({ type: "text", value: text });
      text = "";
    }
  };

  while (i < content.length) {
    if (content.startsWith("$$", i)) {
      const close = content.indexOf("$$", i + 2);
      if (close === -1) return null;
      flushText();
      parts.push({ type: "display", value: content.slice(i, close + 2) });
      i = close + 2;
      continue;
    }
    if (content.startsWith("\\[", i)) {
      const close = content.indexOf("\\]", i + 2);
      if (close === -1) return null;
      flushText();
      parts.push({ type: "display", value: content.slice(i, close + 2) });
      i = close + 2;
      continue;
    }
    text += content[i];
    i += 1;
  }
  flushText();
  return parts;
}

// Split a text region into Markdown chunks and inline-math lines. Consecutive
// non-math lines are kept together so multi-line Markdown (lists, tables) is
// preserved; each line that carries inline math is rendered whole through
// MathJaxSvg so its text and math stay on the same line. Returns null if the
// \( … \) delimiters in the region don't balance (fallback).
function splitInline(text: string): Segment[] | null {
  if (!inlineParensBalanced(text)) return null;
  if (!text.includes("\\(") && !text.includes("$")) {
    return [{ type: "markdown", text }];
  }

  const out: Segment[] = [];
  let buffer: string[] = [];
  const flushBuffer = () => {
    if (buffer.length) {
      out.push({ type: "markdown", text: buffer.join("\n") });
      buffer = [];
    }
  };

  for (const line of text.split("\n")) {
    if (lineHasInlineMath(line)) {
      flushBuffer();
      out.push({ type: "inline", text: toMathJaxInline(line) });
    } else {
      buffer.push(line);
    }
  }
  flushBuffer();
  return out;
}

// True only when \( openers and \) closers pair up in order.
function inlineParensBalanced(text: string): boolean {
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("\\(", i)) {
      depth += 1;
      i += 2;
      continue;
    }
    if (text.startsWith("\\)", i)) {
      depth -= 1;
      if (depth < 0) return false;
      i += 2;
      continue;
    }
    i += 1;
  }
  return depth === 0;
}

function lineHasInlineMath(line: string): boolean {
  const open = line.indexOf("\\(");
  if (open !== -1 && line.indexOf("\\)", open + 2) !== -1) return true;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === "$" && matchDollarMath(line, i) !== -1) return true;
  }
  return false;
}

// If s[i] opens a guard-valid `$…$` inline-math span, return the index just past
// the closing `$`; otherwise -1. Currency guard: no space right after the
// opening `$`, no space before the closing `$`, and the closing `$` is not
// immediately followed by a digit — so "$50 copay … $100" stays literal.
function matchDollarMath(s: string, i: number): number {
  const after = s[i + 1];
  if (after === undefined || after === "$") return -1;
  if (after === " " || after === "\t" || after === "\n") return -1;
  let j = i + 1;
  while (j < s.length) {
    const ch = s[j];
    if (ch === "\n") return -1; // inline $…$ stays on one line
    if (ch === "\\") {
      j += 2; // skip an escaped char (e.g. \$)
      continue;
    }
    if (ch === "$") {
      const before = s[j - 1];
      const next = s[j + 1];
      if (before === " " || before === "\t") return -1;
      if (next !== undefined && next >= "0" && next <= "9") return -1;
      return j + 1;
    }
    j += 1;
  }
  return -1;
}

// Normalize a line before handing it to MathJaxSvg. The library re-parses the
// string with its OWN `$…$` pairing (no currency guard), so we convert every
// guard-valid `$…$` span to \( … \) and escape any remaining bare `$` to `\$`
// (processEscapes renders that as a literal dollar). Existing \( … \) spans are
// copied through untouched. Result: real math renders, currency stays literal.
function toMathJaxInline(line: string): string {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (line.startsWith("\\(", i)) {
      const close = line.indexOf("\\)", i + 2);
      if (close === -1) {
        out += line.slice(i);
        break;
      }
      out += line.slice(i, close + 2);
      i = close + 2;
      continue;
    }
    if (line[i] === "$") {
      const end = matchDollarMath(line, i);
      if (end !== -1) {
        out += "\\(" + line.slice(i + 1, end - 1) + "\\)";
        i = end;
        continue;
      }
      out += "\\$";
      i += 1;
      continue;
    }
    out += line[i];
    i += 1;
  }
  return out;
}

const mathLayout = StyleSheet.create({
  stack: { alignSelf: "stretch" },
  display: { alignItems: "center", marginVertical: 8 },
  inline: { marginVertical: 4 },
});
