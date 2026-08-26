import { useMemo, type ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Markdown from "react-native-markdown-display";
import type { ASTNode } from "react-native-markdown-display";
import MarkdownIt from "markdown-it";
import { MathJaxSvg } from "react-native-mathjax-html-to-svg";

import { MarkdownImage } from "./MarkdownImage";
import {
  faviconSource,
  hostOf,
  noteFaviconFailed,
  siteInitial,
  siteName,
  useFaviconFailed,
} from "@/components/canvas/canvas-sources";
import {
  citationTarget,
  citationsToMarkdown,
  groupCitationRuns,
  isBareUrlLink,
} from "@/components/canvas/citation-markers";
import type { ChatSource } from "@/lib/chat-thread";
import { obsidianInline } from "@/lib/markdown-obsidian";
import { openLink } from "@/lib/open-link";
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
  // 🔴 THESE TWO ARE THE FALLBACK PATH AND ALMOST NEVER RUN. `markdown-obsidian.ts` spells a
  // sub/superscript in Unicode's own raised and lowered characters wherever it can, and that emits
  // ordinary text — no node, so no rule. A node arrives only when the run contains a character
  // Unicode has no such form for (there is no subscript "b" or "y", no superscript "q"). All this
  // can then do is make it smaller, because React Native has no baseline offset at all — the
  // engine check is written out in `lib/sub-sup.ts`. Smaller-but-level is wrong; it is also
  // legible, and it is what the reader gets instead of a literal "<sub>" in the middle of a
  // sentence, which is what they got before.
  sub: (node: ASTNode, children: ReactNode, _parent: unknown, styles: MarkdownStyles) => (
    <Text key={node.key} style={styles.sub}>{children}</Text>
  ),
  sup: (node: ASTNode, children: ReactNode, _parent: unknown, styles: MarkdownStyles) => (
    <Text key={node.key} style={styles.sup}>{children}</Text>
  ),
};

type Segment =
  | { type: "markdown"; text: string }
  | { type: "display"; tex: string }
  | { type: "inline"; text: string };

interface MessageBodyProps {
  content: string;
  styles: MarkdownStyles;
  /**
   * The note reader routes [[wikilinks]] and external URLs through its own
   * handler; chat and review leave this off and get default link handling.
   *
   * 🔴 THE RETURN VALUE IS react-native-markdown-display'S, AND IT IS THE OPPOSITE OF "HANDLED"
   * (owner 2026-08-21). Returning `true` means "I did something AND you should ALSO open this
   * address externally"; returning `false` — or `undefined`, or anything non-boolean — means
   * "leave it to me, do not open it". That is the library's own `openUrl`, verbatim from
   * `node_modules/react-native-markdown-display/src/lib/util/openUrl.js`:
   *
   *     export default function openUrl(url, customCallback) {
   *       if (customCallback) {
   *         const result = customCallback(url);
   *         if (url && result && typeof result === 'boolean') {
   *           Linking.openURL(url);
   *         }
   *       } else if (url) {
   *         Linking.openURL(url);
   *       }
   *     }
   *
   * `InlineLink` below implements exactly that, because every caller of this prop was written
   * against the library and returns `false` from every branch — see `app/note.tsx`
   * ("return false = we handled it; don't let the default open") and
   * `components/NoteBlockEditor.tsx`'s `linkPressToActivate`. Read `false` as "not handled" and a
   * tapped [[wikilink]] both jumps to the note AND hands `wikilink:Some%20Note` to Safari.
   */
  onLinkPress?: (url: string) => boolean;
  /** Known answer sources, in the order the model was given them. Two things
   * depend on this list: a markdown link whose href is one of them becomes a
   * compact citation chip carrying the site's favicon, and a numbered citation
   * marker — `[1]` — is resolved through it into the same chip. See
   * `citationsToMarkdown` and `InlineLink`. */
  sources?: ChatSource[];
}

export function MessageBody({ content, styles, onLinkPress, sources }: MessageBodyProps) {
  const { colors: c } = useTheme();
  // Numbered markers become links BEFORE the parser sees the text; everything
  // after this point is ordinary markdown. See `citationsToMarkdown`.
  //
  // 🔴 GROUPING IS HANDED THE SAME RESOLVABILITY TEST THE `link` RULE USES, AND THAT IS WHAT KEEPS
  // A CITATION FROM BEING DELETED (owner 2026-08-21). `groupCitationRuns` collapses `[1][2]` into
  // ONE link whose href carries the first number and a count — the second number is not in it
  // anywhere. That is fine for a chip reading "Reuters +1" and fatal for the fallback below, which
  // has only the href to rebuild from: the run would come back as `[1]` and source 2 would be gone
  // from the sentence. Passing `citationSite` means a run is only ever collapsed when every source
  // in it can actually be drawn as a named chip, so the fallback only ever meets lone markers.
  const prepared = useMemo(
    () =>
      groupCitationRuns(
        citationsToMarkdown(content, sources?.length ?? 0),
        (index) => citationSite(sources, index) !== null,
      ),
    [content, sources],
  );
  const segments = useMemo(() => buildSegments(prepared), [prepared]);
  // 🔴 EVERY SURFACE GOES THROUGH OUR `link` RULE NOW, AND THE EARLY-OUT THAT USED TO SPARE THEM IS
  // GONE ON PURPOSE (owner 2026-08-21). This function opened with
  // `if (!sources?.length) return MARKDOWN_RULES`, so notes, the note editor, review, flashcards
  // and notebooks kept react-native-markdown-display's OWN `link` rule and never met `InlineLink`.
  // TRIED AND REJECTED: keeping it. It cannot survive the bare-URL demotion — an answer with NO
  // search results is still an answer, `sources` is `[]` there, and `!sources?.length` is true for
  // it, so the very case the owner reported (a model quoting an address from memory, printed raw
  // mid-paragraph) took the early-out and stayed a raw URL. `sources !== undefined` is the test
  // that tells an answer from a student's own prose; length cannot do that job.
  // THE PRICE: `InlineLink` now owns link presses on the note screens too, which is why its `open`
  // must speak the library's contract exactly rather than an inverted one of our own. See the
  // `onLinkPress` JSDoc above.
  // 🔴 AND THE INVERSION WAS REAL, BUT IT NEVER REACHED ANYONE — CHECKED, NOT ASSUMED (owner
  // 2026-08-21, correcting an earlier version of this very comment that said it "shipped"). The
  // released file (`git show HEAD:…/MessageBody.tsx`, commit 23f9c0f2, 2026-07-29) does contain
  // `const handled = onLinkPress?.(href) ?? false; if (!handled) …` — but it also opens with the
  // `if (!sources?.length) return MARKDOWN_RULES` early-out, and the only two screens that pass
  // `onLinkPress` (`app/note.tsx`, `components/NoteBlockEditor.tsx`) pass NO `sources`. So on every
  // released build they took the early-out and got the library's own correct `openUrl`; the
  // inverted branch was unreachable for them. Removing the early-out above is what made it
  // reachable, and it was corrected the same day, in this working tree, before any commit. Recorded
  // because the trap is real and the next reader will meet it — not because it was ever a
  // production incident. Saying otherwise sends someone hunting a release that does not exist.
  const rules = useMemo(() => {
    const sourceUrls = new Set((sources ?? []).map((source) => normalizedUrl(source.url)));
    // 🔴 THE `sources` PROP IS WHAT SAYS "THIS IS AN ASSISTANT ANSWER" (owner 2026-08-20). Only the
    // two answer surfaces pass it — Chat and the Learn canvas — and they pass it even when the turn
    // searched nothing, so an empty list still means an answer. Notes, review and flashcards never
    // pass it. That distinction is load-bearing for rule 2 below: rewriting an address into a chip
    // is right in a machine's prose and wrong in the student's own, where a URL they typed into a
    // note is their content and must render as they wrote it.
    const isAssistantAnswer = sources !== undefined;
    return {
      ...MARKDOWN_RULES,
      link: (node: ASTNode, children: ReactNode) => {
        const href = String(node.attributes?.href ?? "");

        // 1. A numbered citation marker, already rewritten into a link by
        //    `citationsToMarkdown` before the parser ever saw the text. The
        //    number is an index into `sources`, resolved HERE rather than in
        //    the text, so the chip can carry the publication's name instead of
        //    a digit the reader has nowhere to look up.
        const citation = citationTarget(href);
        if (citation !== null) {
          const site = citationSite(sources, citation.index);
          // 🔴 THE FALLBACK REBUILDS THE BRACKETS, BECAUSE `children` IS NOT WHAT THE MODEL WROTE
          // (owner 2026-08-21). Not resolving is an ordinary, DOCUMENTED outcome now, not a
          // replay accident: a canvas source that was an upload has no address anywhere — see the
          // `sources` comment in `CanvasDocument.tsx` — and `hostOf` also refuses a `javascript:`
          // address, so a chip is never built over something that should not be opened. In every
          // one of those cases the marker has to go back to being a marker.
          //   TRIED AND REJECTED: `<Text>{children}</Text>`, which is what stood here.
          // `citationsToMarkdown` rewrote `[3]` into `[3](#nemesis-cite=3)`, and a markdown link's
          // visible text is the part inside the brackets — just `3`. Parsed through the phone's
          // real markdown-it config under node, "Revenue showed a 40% drop [3]." came out of the
          // renderer as "Revenue showed a 40% drop 3.": a stray digit welded to the prose, with
          // the reader given no hint that it was ever a citation. `[${citation.index}]` is the
          // text the model actually typed, and the two brackets are the whole cost of saying so.
          //   `extra` is 0 here by construction — `prepared` above refuses to collapse a run it
          // cannot name — so there are no further numbers to restore at this point.
          if (!site) return <Text key={node.key}>{`[${citation.index}]`}</Text>;
          const { url, host: citedHost } = site;
          return (
            <InlineLink
              key={node.key}
              url={url}
              chip
              host={citedHost}
              label={siteName(citedHost)}
              extra={citation.extra}
              linkStyle={styles.link}
              onLinkPress={onLinkPress}
            >
              {children}
            </InlineLink>
          );
        }

        const host = hostOf(href);

        // 2. A bare URL the model typed into the sentence — the reported bug:
        //    "(https://api-docs.deepseek.com/updates, https://releasebot.io/…)"
        //    sitting underlined mid-paragraph. `linkify` turns it into a link
        //    whose text IS its address, so there is no author wording to
        //    protect and the chip is named for the site instead. Note this does
        //    NOT require the URL to be one of `sources`: a model quoting an
        //    address from memory produces exactly the same eyesore, and the
        //    screen has to cope with it whatever the prompt asks for.
        if (isAssistantAnswer && host && isBareUrlLink(href, nodeText(node))) {
          return (
            <InlineLink
              key={node.key}
              url={href}
              chip
              host={host}
              label={siteName(host)}
              linkStyle={styles.link}
              onLinkPress={onLinkPress}
            >
              {children}
            </InlineLink>
          );
        }

        // 3. An ordinary written link. A chip only when it points at one of this
        //    answer's own sources, and it keeps the words the model wrote — up
        //    to the length a pill can physically hold. See `CHIP_AUTHORED_MAX`.
        const authored = nodeText(node);
        const isSource =
          sourceUrls.has(normalizedUrl(href)) && authored.length <= CHIP_AUTHORED_MAX;
        return (
          <InlineLink
            key={node.key}
            url={href}
            chip={isSource}
            host={isSource ? host : null}
            linkStyle={styles.link}
            onLinkPress={onLinkPress}
          >
            {children}
          </InlineLink>
        );
      },
    };
  }, [onLinkPress, sources, styles]);

  // No real math (or unbalanced delimiters → fallback): render the message as a
  // single plain Markdown block with NO wrapper, byte-identical to before.
  if (!segments) {
    return <Markdown style={styles} rules={rules} markdownit={MARKDOWN_PARSER} onLinkPress={onLinkPress}>{prepared}</Markdown>;
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

/**
 * Where a `[n]` marker points, or null when this answer has nothing openable at that position.
 *
 * 🔴 ONE FUNCTION, TWO CALLERS, AND THEY MUST NOT DISAGREE (owner 2026-08-21). The `link` rule asks
 * it "can I draw a chip for this marker"; `prepared` asks `groupCitationRuns` the same question
 * before collapsing a run. If those two answers ever diverged, a run could be collapsed into a chip
 * the renderer then refused to draw — and the fallback, which has only the first number, would drop
 * the rest of the run out of the sentence. Sharing the test is what makes that impossible rather
 * than merely unlikely.
 *
 * `hostOf` is the second half of the check and not a formality: it is what refuses a `javascript:`
 * or otherwise non-http address, so nothing that should not be opened ever reaches a chip.
 */
function citationSite(sources: ChatSource[] | undefined, index: number): { url: string; host: string } | null {
  const url = sources?.[index - 1]?.url?.trim() ?? "";
  if (!url) return null;
  const host = hostOf(url);
  return host ? { url, host } : null;
}

/**
 * One markdown link, in one of two shapes.
 *
 * `chip` off — an ordinary link: a <Text> with a press handler, styled exactly as it always was.
 * `chip` on — the compact citation pill, the phone's version of the web's "named inline pill" from
 * `chat-markdown.tsx`: a 12pt round favicon, a hair of space, then a short label, on a flat fill
 * with no border.
 *
 * 🔴 IT CARRIES THE SITE'S FAVICON (owner asked twice, 2026-08-20). The pill UNDER an answer has
 * had icons since it was built; the chips inside the prose were bare text, so the same source
 * looked like two different things on one screen.
 *
 * 🔴 THE CHIP IS A <View> NESTED INSIDE A <Text>, AND BOTH HALVES OF THAT SENTENCE ARE LOAD-BEARING
 * (owner 2026-08-21: "the inline sources dont look like pills or bubbles, fix"). The <Text> wrapper
 * is NOT decoration. This is returned from a markdown-display `link` rule, so it lands inside a
 * paragraph's textgroup, and `node_modules/react-native-markdown-display/src/lib/renderRules.js`
 * is explicit about what that means: `textgroup` is `<Text style={styles.textgroup}>{children}</Text>`
 * but `paragraph` is `<View style={styles._VIEW_SAFE_paragraph}>{children}</View>` — a column flex
 * container. Return a bare <View> from this rule and it becomes a direct child of that column, i.e.
 * its own block row, and the sentence is cut into "words above / box / words below". Keeping the
 * <Text> wrapper is what makes the <View> an INLINE view instead. Same trap the `mark`/`tag`/`u`
 * rules note above.
 *
 * 🔴 AND THE <View> IS THE FIX, BECAUSE A NESTED <Text> CANNOT BE A PILL ON iOS — READ FROM THE
 * ENGINE, NOT FROM FOLKLORE (owner 2026-08-21). What used to stand here was a <Text> carrying
 * `borderRadius: 999`, `paddingHorizontal` and `paddingVertical`, and the phone drew a SQUARE grey
 * rectangle welded to the glyphs. The reason is in React Native 0.85.3's own source, which this
 * repo pins:
 *   • A <Text> nested inside another <Text> is not a view at all. It is folded into the parent
 *     paragraph's attributed string, and the ONLY styling that survives is the field list of
 *     `ReactCommon/react/renderer/attributedstring/TextAttributes.h`. That struct has
 *     `backgroundColor` — and NO border, NO borderRadius and NO padding of any kind. There is
 *     nowhere for those three properties to go, so they are dropped before layout ever runs.
 *   • `backgroundColor` becomes `NSBackgroundColorAttributeName`
 *     (`…/textlayoutmanager/platform/ios/…/RCTAttributedTextUtils.mm`, in
 *     `RCTNSTextAttributesFromTextAttributes`), which UIKit paints as a plain filled rectangle
 *     behind the glyph run. Square corners, and tight to the glyphs because the padding was
 *     dropped. That is the screenshot, exactly.
 *   • The favicon sitting OUTSIDE the grey box is the SAME file, thirty lines down. A non-Text
 *     child of a <Text> — our <Image> — is turned into an ATTACHMENT
 *     (`ReactCommon/react/renderer/components/text/BaseTextShadowNode.cpp`: "Any *other* kind of
 *     ShadowNode" → `AttachmentCharacter`), and `RCTNSAttributedStringFragmentFromFragment` builds
 *     that fragment as `[NSMutableAttributedString attributedStringWithAttachment:]` with NO
 *     attribute dictionary at all — `fragment.textAttributes` is used only on the `else` branch.
 *     So the icon's slice of the line carried no background attribute and the fill simply stopped
 *     and restarted around it. One root cause, two symptoms.
 * A <View> has none of those limits: it is a real Yoga box with real padding and a real corner
 * radius, and requirement 4 — one fill under the icon AND the label — falls out of it for free,
 * because both are now children of the box rather than neighbouring runs of text.
 *
 * 🔴 THE INLINE VIEW IS THE MECHANISM THAT ALREADY WORKED HERE. It is not a new bet: the <Image>
 * this chip has drawn since 2026-08-20 goes down the identical attachment path, which is why the
 * icon has always flowed with the words. `ParagraphShadowNode::layout` measures each attachment
 * with the PARAGRAPH's own width constraint, hands its size to the text layout as a placeholder,
 * then repositions the real view at the frame the text layout chose — so the pill wraps with the
 * sentence and never widens past the column. Vertically, `RCTTextLayoutManager.mm` places an
 * attachment at `glyphRect.bottom - attachmentHeight + font.descender`, i.e. its bottom edge on
 * the text baseline; an 18pt pill therefore rises 18pt off the baseline inside a 28pt body line
 * (`theme/markdown.ts`), with room to spare and no line-height inflation.
 *   TRIED AND REJECTED: faking round ends on the <Text> with characters (a U+E0B6-style pair, or
 * two half-disc glyphs) or a nine-slice background image. Both draw a shape that cannot track the
 * fill colour through a theme change, and neither gives back the padding — which is the other half
 * of what was missing.
 *   TRIED AND REJECTED: `marginHorizontal: 2` on the pill to port the web's `mx-[2px]`. An
 * attachment's size comes from `LayoutableShadowNode::measure`, which returns
 * `getLayoutMetrics().frame.size` — a frame EXCLUDES its own margin — and the attachment's position
 * is then overwritten by the text layout. So the margin would be honoured on react-native-web and
 * silently do nothing on the phone: worse than not having it, because the two surfaces would drift.
 * The pill's own left/right padding is the separation on both.
 *
 * 🔴 react-native-web GETS THE SAME SHAPE BY THE SAME NAME. `react-native-web@0.21`'s View reads
 * `TextAncestorContext` and, when it has one, adds `display: inline-flex`
 * (`dist/exports/View/index.js`, `styles.inline`). That is character-for-character the technique
 * `apps/web/lib/workspace/chat-markdown.tsx` uses for its own named pill — `inline-flex ... rounded
 * ... align-baseline` — so the phone's web build and the real web app now round their corners
 * through the same CSS box model instead of two different ones.
 *
 * 🔴 WHOSE WORDS THE CHIP SHOWS IS DECIDED BY THE CALLER, AND THE RULE HAS TWO HALVES (owner
 * 2026-08-20). The original half stands and is not withdrawn: A CHIP BUILT OVER AN AUTHORED LINK
 * KEEPS THE MODEL'S OWN LINK TEXT and does NOT get replaced with the site name — this rule fires
 * for any markdown link that matches one of the answer's sources, including a prose link written
 * mid-sentence, and "according to [the 2019 trial](…)" becoming "according to Nature" mangles the
 * sentence to gain nothing. The icon adds provenance; it does not need to overwrite the words.
 * The second half is the case that half never covered: a BARE URL the model typed as an address,
 * and a resolved `[1]` marker, have no author words at all — the visible text is the address
 * itself, or a digit. There the caller passes `label` and the site's name replaces it, because
 * forty characters of URL mid-paragraph is exactly what the owner reported seeing and a digit
 * names nothing. `isBareUrlLink` in `citation-markers.ts` is what tells the two apart.
 *
 * `extra` is how many further sources a grouped run of markers stands for — drawn as "+2" after
 * the label, because a chip that swallowed them silently would be claiming one source where the
 * sentence cited three. See `groupCitationRuns`.
 *
 * The letter fallback is the module's, and it is real — see `canvas-sources.ts` for the probe that
 * settles a host's icon once per session under either of the two readings of the resolver's
 * behaviour. No disc behind the letter here: this chip already has its own fill, and a badge inside
 * a badge reads as a rendering accident.
 */
function InlineLink({
  children,
  url,
  chip,
  host,
  label,
  extra = 0,
  linkStyle,
  onLinkPress,
}: {
  children: ReactNode;
  url: string;
  /** Draw the compact citation pill instead of an ordinary underlined link. */
  chip: boolean;
  /** The site whose icon the chip shows. Null when there is nothing openable to name. */
  host: string | null;
  /** Replaces the link's own text. Only ever passed where there is no authored text to keep. */
  label?: string;
  /** Further sources collapsed into this one chip; 0 for a lone citation. */
  extra?: number;
  linkStyle: object;
  /** Same contract as `MessageBodyProps.onLinkPress`: `true` = "also open it externally",
   *  anything else = "I handled it, do not open it". Implemented in `open` below. */
  onLinkPress?: (url: string) => boolean;
}) {
  const { colors: c } = useTheme();
  // Unconditional: hooks cannot hide behind `host`, and the memo answers false for "".
  const iconFailed = useFaviconFailed(host ?? "");
  // 🔴 A TRANSCRIPTION OF react-native-markdown-display'S `openUrl`, NOT AN INTERPRETATION OF IT
  // (owner 2026-08-21). The library source is quoted in full on the `onLinkPress` prop above; the
  // shape below is that function with our `url` already in hand. Two facts it encodes and that a
  // shorter spelling loses:
  //   • NO callback at all still opens the address — that is how chat, review and flashcards get
  //     ordinary link behaviour without passing a handler.
  //   • `=== true` is the library's `result && typeof result === 'boolean'`. A handler that
  //     returns nothing must NOT open the browser, which is precisely what a void-returning
  //     callback written by a caller who thought `false` meant "handled" looks like.
  // TRIED AND REJECTED: `const handled = onLinkPress?.(url) ?? false; if (!handled) open()`. It
  // reads naturally and is exactly backwards. Every caller returns `false` from every branch, so
  // with this rule now applying to the note screens it opens Safari after every in-app navigation:
  // a [[wikilink]] both jumps to the note and hands `wikilink:Some%20Note` to the browser, an
  // external link in a note opens twice, and a tap on any line containing a link in the note EDITOR
  // throws the writer out to Safari instead of placing a caret.
  //   Present tense on purpose: that spelling sat in this working tree for part of 2026-08-21 and
  // was corrected before it was committed. It is NOT what any released build did — the shipped
  // version of this file never ran this rule on a screen that passes `onLinkPress`, for the reason
  // set out beside the early-out in `MessageBody` above.
  //   🔴 THE OPENER CHANGED HERE ON 2026-08-21; THE CONTRACT ABOVE DID NOT. Owner: "instead of
  // taking the user to safari, can the app do a mini viewer?" `Linking.openURL` — which
  // backgrounds Nemesis — was replaced by `lib/open-link.ts`, which presents the address in an
  // in-app viewer over the app and falls back to the OS for anything that is not http(s). That is
  // a swap of the ACTION only: both branches below still fire on exactly the conditions they fired
  // on before, `=== true` is still `=== true`, and a handler returning `false`/`undefined` still
  // opens nothing. The two are independent, and conflating them is the defect the block above
  // records — if the viewer ever needs removing, it is the two `openLink` calls below that revert
  // to `Linking.openURL`, and nothing about the shape around them moves.
  //   🔴 AND THE CHIPS ARE WHY THIS FILE IS IN SCOPE AT ALL. The owner reported the Sources
  // drawer, because that is where he was standing. But a well-cited answer carries a dozen of
  // these chips inside its sentences, they are the commoner tap by a wide margin, and being thrown
  // to Safari from the middle of a paragraph is the more jarring exit of the two. Fixing only the
  // drawer would have answered the report and not the complaint.
  //   The `onLinkPress` branch is not dead, even though every current caller returns `false`
  // everywhere: it is the library's contract, so it stays honoured. `app/note.tsx` is the case
  // that proves the two ends had to be fixed together — its handler returns `false` for an
  // external URL and opens that URL ITSELF, so this branch stays silent and the note's own call
  // site had to be routed through `openLink` as well, or a note's links would have been the one
  // place still leaving for Safari.
  const open = () => {
    if (onLinkPress) {
      if (url && onLinkPress(url) === true) void openLink(url, c);
      return;
    }
    if (url) void openLink(url, c);
  };

  if (!chip) {
    return (
      <Text accessibilityRole="link" onPress={open} style={linkStyle}>
        {children}
      </Text>
    );
  }

  // The bare <Text> is the inline anchor and nothing else — no fill, no padding, no press handler.
  // See the 🔴 block above for why removing it would cut the paragraph in two.
  return (
    <Text>
      {/* 🔴 Pressable, NOT the wrapper <Text>, OWNS THE TAP (owner 2026-08-21). The pill is a real
          view sitting on top of the paragraph, so it is what a finger actually lands on. React
          Native's responder negotiation starts at the deepest touched node and the first one that
          claims the touch wins, so exactly one handler fires — putting `open` on the wrapper <Text>
          as well would not double-open, but it WOULD give VoiceOver two elements for one chip
          (a pressable text range and a pressable view) and read the source name twice.
          Requirement, unchanged since the in-app viewer landed: the press goes through `openLink`. */}
      <Pressable
        accessibilityRole="link"
        // The chip shows a site name; the reader of a screen reader gets the page it opens.
        accessibilityLabel={label ? (extra > 0 ? `${label}, and ${extra} more sources` : label) : undefined}
        accessibilityHint={label ? url : undefined}
        onPress={open}
        style={[
          inlineCitation.pill,
          { backgroundColor: c.surface2 },
          host ? inlineCitation.pillWithMark : inlineCitation.pillPlain,
        ]}
      >
        {host ? (
          iconFailed ? (
            <Text style={[inlineCitation.initial, { color: c.text2 }]}>{siteInitial(host)}</Text>
          ) : (
            <Image
              source={faviconSource(host)}
              style={inlineCitation.icon}
              onError={() => noteFaviconFailed(host)}
              accessibilityIgnoresInvertColors
            />
          )
        ) : null}
        {/* The label is its own <Text> now that the fill lives on the box. `children` is a markdown
            subtree (rule 3 keeps the model's own words), so it has to stay inside a <Text>. */}
        <Text style={[inlineCitation.label, { color: c.textHint }]}>{label ?? children}</Text>
        {extra > 0 ? <Text style={[inlineCitation.extra, { color: c.text3 }]}>{`+${extra}`}</Text> : null}
      </Pressable>
    </Text>
  );
}

/**
 * How many characters of AUTHORED link text a citation pill may carry before the caller gives up
 * on the pill and draws an ordinary underlined link instead.
 *
 * 🔴 THIS CAP EXISTS ON THE PHONE AND DOES NOT EXIST ON THE WEB, AND THAT IS CORRECT — IT IS NOT
 * DRIFT TO BE "FIXED" BY COPYING ONE SIDE ONTO THE OTHER. `apps/web/lib/workspace/chat-markdown.tsx`
 * needs no cap because its pill is an `inline-flex` box in normal flow: text inside it wraps, so a
 * long linked phrase simply makes a taller rounded box and the paragraph carries on. The phone's
 * pill is a <Pressable> — a real view — living inside the paragraph's attributed string as a text
 * ATTACHMENT (see the 🔴 block on `InlineLink`). An attachment is one indivisible rectangle. iOS
 * will move it to the next line when it does not fit in the space remaining, but it cannot break it
 * across lines, so an attachment wider than the WHOLE column has nowhere to go and runs off the
 * edge. The cap is measured against full column width for exactly that reason.
 *
 * WHY 40. The label draws at 12pt (`inlineCitation.label`); the system face averages a shade under
 * 6pt per character at that size for mixed-case prose, and the pill's own chrome — 12pt icon, 3pt
 * gap, 3+6 padding — costs 24pt. 40 characters is therefore ≈ 264pt against a reading column that
 * is a little over 340pt on a 402pt-wide phone. That is a deliberately loose fit, not a measured
 * limit: the arithmetic is an estimate, the text scale is user-adjustable, and the number should
 * stay well inside the column rather than tuned up to touch it.
 *
 * 🔴 WHAT HAPPENS PAST THE CAP IS A PLAIN LINK, NEVER A SHORTENED ONE. Two shortcuts were
 * available and both were rejected: replacing the words with the site name is forbidden outright by
 * the owner's 2026-08-20 rule recorded on `InlineLink` ("according to [the 2019 trial](…)" becoming
 * "according to Nature" mangles the sentence to gain nothing), and ellipsising to "the 2019 Nature
 * trial on beta bl…" mangles it the same way for the same nothing. Dropping back to an underlined
 * link keeps every word the model wrote and is precisely what this renderer did before pills
 * existed, so the failure mode is the old behaviour rather than a new one. The only thing lost is
 * the favicon, on the rare long link where there was no room to draw it honestly anyway.
 */
const CHIP_AUTHORED_MAX = 40;

/**
 * The visible text of a link node, flattened.
 *
 * The only thing it is used for is telling an autolinked address apart from an authored link — see
 * `isBareUrlLink`. Recurses because the parser groups a paragraph's inline runs under `textgroup`
 * nodes, so a link's words are usually one level down rather than directly on it.
 */
function nodeText(node: ASTNode): string {
  if (node.type === "text") return typeof node.content === "string" ? node.content : "";
  return (node.children ?? []).map(nodeText).join("");
}

// 🔴 THESE ARE VIEW STYLES NOW, AND THAT IS THE WHOLE POINT (owner 2026-08-21). Every number below
// except the two font sizes used to be set on a nested <Text>, where React Native's engine has
// nowhere to put a radius or a padding — see the 🔴 block on `InlineLink`. On a <View> they all
// mean what they say.
//
// GEOMETRY, BESIDE THE WEB'S OWN NAMED PILL (`apps/web/lib/workspace/chat-markdown.tsx`, the
// `namedCitations` branch: `h-[18px] rounded-[12px] gap-[3px] pl-[3px] pr-[6px]`, `size-[12px]`
// icon, `text-[9px] leading-none`):
//   height   18 = the label's 18pt line box, the icon's 12pt centred inside it → web's h-[18px].
//   radius   999 → React Native clamps a radius to half the shorter side, so 9 on an 18-high box:
//            fully round ends, where the web's literal 12px on 18px is round-ish. Same intent, and
//            999 keeps its promise if the label's line box ever grows.
//   gap      3 → web's gap-[3px]. It replaces the literal `" "` that used to sit between the icon
//            and the label, which was a space at the BODY font size (18pt) and so far too wide.
//   padding  3 left / 6 right → web's pl-[3px] pr-[6px], and asymmetric for the same reason there:
//            the favicon is a filled disc that already reads as its own margin, so matching the
//            text side's 6 would look like a hole punched in the left end of the pill.
//   label    12pt, not the web's 9px, because the phone's body text is 18/28 against the web's ~15
//            (`theme/markdown.ts`). The 12pt icon is what both sides hold fixed.
const inlineCitation = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 999 },
  pillWithMark: { paddingLeft: 3, paddingRight: 6 },
  // No icon, no asymmetry to justify: a chip with nothing openable to name (rule 3 over a source
  // whose href `hostOf` refused) is just a worded pill, so both ends get the text side's padding.
  pillPlain: { paddingHorizontal: 6 },
  // 12pt against 12/18 text — the web's named pill draws a 12px `rounded-full` icon at the same
  // ratio. Exempt from the text scale for the reason `canvas-metrics.ts` gives: it is a glyph.
  icon: { width: 12, height: 12, borderRadius: 6 },
  // Pinned to the icon's 12pt width and centred so the pill does not visibly resize when a host's
  // favicon turns out to be missing and the letter takes over mid-session.
  initial: { width: 12, fontSize: 9, lineHeight: 18, fontWeight: "700", textAlign: "center" },
  label: { fontSize: 12, lineHeight: 18 },
  // Quieter than the label it trails: "+2" is a count, not the name of anything. The leading space
  // it used to carry is now the flex `gap`.
  extra: { fontSize: 10, lineHeight: 18, fontWeight: "600" },
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
