import { useMemo, type ReactNode } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import Markdown from "react-native-markdown-display";
import type { ASTNode } from "react-native-markdown-display";
import MarkdownIt from "markdown-it";
import { MathJaxSvg } from "react-native-mathjax-html-to-svg";

import { MarkdownImage } from "./MarkdownImage";
import { SourcePill } from "./SourcePill";
import { citationsToMarkdown, parseCitationHref } from "@/lib/chat-citations";
import type { ChatSource } from "@/lib/chat-thread";
import { obsidianInline } from "@/lib/markdown-obsidian";
import { createMarkdownStyles } from "@/theme/markdown";
import { useTheme } from "@/theme/ThemeProvider";

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

// Replicates react-native-markdown-display's own openUrl (lib/util/openUrl.js):
// when the caller supplied an onLinkPress it decides (returning `true` to also
// open the URL, `false` to handle it itself, e.g. the note reader's wikilinks);
// with no handler we just open the URL. Reproduced here because the citation
// link rule below overrides `link`, so it can no longer inherit the library's
// default. The .catch keeps a blocked/invalid URL from throwing.
function openMarkdownLink(url: string, onLinkPress?: (url: string) => boolean): void {
  if (onLinkPress) {
    const result = onLinkPress(url);
    if (url && result === true) void Linking.openURL(url).catch(() => {});
  } else if (url) {
    void Linking.openURL(url).catch(() => {});
  }
}

// A `link` render rule that paints citation links (`[1](#nemesis-cite=1,2)`,
// produced by citationsToMarkdown) as inline SourcePills and leaves every other
// link behaving exactly like the library default. Built per-answer so it can
// close over that answer's `sources` and the tap handler; only installed when an
// answer actually carries sources, so note/review/flashcard callers keep the
// untouched default `link` rule.
function makeCitationLinkRule(
  sources: ChatSource[],
  onCitationPress: ((sources: ChatSource[]) => void) | undefined,
  onLinkPress: ((url: string) => boolean) | undefined,
) {
  return function link(node: ASTNode, children: ReactNode, _parent: unknown, styles: MarkdownStyles) {
    const href = String(node.attributes?.href ?? "");
    const indices = parseCitationHref(href);
    if (indices.length > 0) {
      const cited = indices
        .map((n) => sources[n - 1])
        .filter((source): source is ChatSource => Boolean(source));
      // The rewrite only emits in-range markers, so an empty result means stale
      // markup (an edited/replayed answer) — drop the chip rather than leave a
      // bare "[1]" number sitting in the prose.
      if (cited.length === 0) return null;
      return <SourcePill key={node.key} sources={cited} onPress={() => onCitationPress?.(cited)} />;
    }
    return (
      <Text key={node.key} style={styles.link} onPress={() => openMarkdownLink(href, onLinkPress)}>
        {children}
      </Text>
    );
  };
}

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
  /** Web-search results backing this answer. Supplying them turns the answer's
   *  [n] markers into inline source pills (chat only); omitting them renders the
   *  text exactly as before, so the note reader / review / flashcard callers are
   *  byte-identical. */
  sources?: ChatSource[];
  /** Tapping a pill hands back the sources it groups, so chat.tsx can open the
   *  detail sheet — the phone's stand-in for web's hover card. */
  onCitationPress?: (sources: ChatSource[]) => void;
}

export function MessageBody({ content, styles, onLinkPress, sources, onCitationPress }: MessageBodyProps) {
  const { colors: c } = useTheme();
  const sourceCount = sources?.length ?? 0;

  // Rewrite [n] markers into pill links ONCE, then feed the SAME string to both
  // the fast path and the math splitter. No sources → the text is untouched, so
  // every non-chat caller renders exactly as it did before this feature.
  const rendered = useMemo(
    () => (sourceCount > 0 ? citationsToMarkdown(content, sourceCount) : content),
    [content, sourceCount],
  );
  const segments = useMemo(() => buildSegments(rendered), [rendered]);

  // Only swap in the citation-aware `link` rule when this answer has sources;
  // otherwise pass the static rules untouched so other surfaces keep the
  // library's default link behaviour.
  const rules = useMemo(
    () =>
      sourceCount > 0 && sources
        ? { ...MARKDOWN_RULES, link: makeCitationLinkRule(sources, onCitationPress, onLinkPress) }
        : MARKDOWN_RULES,
    [sourceCount, sources, onCitationPress, onLinkPress],
  );

  // No real math (or unbalanced delimiters → fallback): render the message as a
  // single plain Markdown block with NO wrapper, byte-identical to before.
  if (!segments) {
    return <Markdown style={styles} rules={rules} markdownit={MARKDOWN_PARSER} onLinkPress={onLinkPress}>{rendered}</Markdown>;
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
