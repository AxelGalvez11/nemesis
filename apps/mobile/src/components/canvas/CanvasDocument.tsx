// An older canvas, read back from `learning_canvases.document`.
//
// 🔴 THIS IS THE READER THE LIBRARY WAS WAITING FOR. `components/library/CanvasManagerBody.tsx`
// held its canvas rows as non-navigating on purpose — its header says so in as many words — for
// the single reason that nothing on the phone could render `learning_canvases.document`. This
// file is that thing, so the hold is over and the tap is a real navigation.
//
// 🔴 IT RENDERS WHAT THE ROW ACTUALLY HOLDS, AND NOTHING ELSE. A stored canvas also carries
// concepts, recall results, corrective attempts, the learner's own responses, outputs and
// interaction telemetry. None of those have a phone surface. Drawing a heading for them, or a
// count, or an empty section, would be describing the student's own work back to them from data
// this screen cannot actually show — which is the same class of claim as the source count
// `CanvasManagerBody` refuses to put on a row.
//
// 🔴 AND NO TITLE (owner: "there should not be any canvas titles"). The canvas's name is how it is
// found in the Library; it is not a heading on the thing itself. The screen keeps the TopBar title
// null for the same reason.
//
// 🔴 THE ONE THING IT DRAWS BESIDES BLOCKS IS THE SOURCE PILLS, ADDED WHEN THE PHONE STARTED
// WRITING CANVASES (2026-08-20). That is not a widening of the rule above, it is the rule applied:
// the objection to drawing concepts, recall results and telemetry is that this screen cannot
// actually SHOW them, so a heading or a count would be describing the student's work back to them
// from data it does not have. A source is the opposite case — the canvas holds the page's title and
// its address, and a pill built from those opens the page. It is the same component, fed from the
// same resolver, as the pills under a live answer, so a citation looks identical whether the
// student is reading the reply as it arrives or reopening the canvas a week later.
//
// 🔴 AND THAT PROMISE COVERS THE PROSE, NOT JUST THE FOOTER (owner 2026-08-21). The pills shipped
// first and the sentence above was written for them, but half the citations on a canvas are INSIDE
// the text — a `[1]` marker, or an address the model typed mid-paragraph — and those are resolved
// by `MessageBody` from the `sources` prop, which this file did not pass. The result contradicted
// the very line above it: the same block rendered as a named chip while the answer streamed and as
// a literal "[1]", or forty characters of raw URL, when the canvas was reopened. The `sources`
// array built below is passed to EVERY `MessageBody` here for that reason. See `Block`'s prop doc
// for why it is always passed and never omitted.
//
// 🔴 AND A SOURCE WITH NO ADDRESS DRAWS NOTHING. `sourcePills` refuses anything it cannot resolve
// to an http(s) URL — an uploaded file has no address anywhere, and `CanvasSource.sourceUrl` is
// documented as absent for every one of them. A pill that names a source and cannot open it is a
// claim this surface cannot support.

import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { MessageBody } from "@/components/MessageBody";
import type { StoredCanvas, StoredCanvasBlock } from "@/api/canvases";
import type { ChatSource } from "@/lib/chat-thread";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

import { CANVAS_TEXT } from "./canvas-metrics";
import { sourcePills } from "./canvas-sources";
import { CanvasSourcePills } from "./CanvasSourcePills";

export function CanvasDocument({ canvas }: { canvas: StoredCanvas }) {
  const styles = useThemedStyles(createStyles);
  const markdownStyles = useThemedStyles(createMarkdownStyles);

  // 🔴 ONE LIST, IN THE STORED ORDER, FEEDING BOTH HALVES OF THE PROVENANCE (owner 2026-08-21).
  // The prose and the pills read the same `ChatSource[]`, built once here, because a `[1]` in a
  // stored block is an INDEX INTO THIS ARRAY — resolved by position, not by matching a URL — so
  // reordering it or dropping an entry would silently repoint a citation at the wrong publication.
  // That is why the mapping is 1:1 with `canvas.sources` and a source with no address becomes an
  // empty `url` rather than being filtered out: position 3 has to stay position 3 even when
  // nothing openable lives there. `MessageBody` already refuses to build a chip over an empty
  // address and leaves the bare number instead, which is the honest outcome for an upload.
  const sources = useMemo<ChatSource[]>(
    () => canvas.sources.map((source) => ({ description: "", title: source.title, url: source.url ?? "" })),
    [canvas.sources],
  );

  // Through the SAME resolver the live answer's pills use, rather than a second mapping written
  // here — the de-duplication, the site naming and the refusal to draw an unopenable pill are all
  // decisions that belong in one place. A stored source with no address arrives as an empty `url`
  // and is dropped there. The DROPPING is why this cannot double as the array above: `sourcePills`
  // compacts the list, and a compacted list would misnumber every marker after the first gap.
  const pills = useMemo(() => sourcePills(sources), [sources]);

  // 🔴 AN HONEST SENTENCE, NOT AN EMPTY SCROLL. A canvas whose document holds no blocks is a real
  // and normal row — one started on the web and abandoned before anything was written into it.
  // Rendering nothing would be indistinguishable from a failed load. Its sources, if it has any,
  // still show: they are the one thing that canvas does hold.
  return (
    <View style={styles.doc}>
      {canvas.blocks.length === 0 ? (
        <Text style={styles.empty}>Nothing was written on this canvas yet.</Text>
      ) : (
        canvas.blocks.map((block) => (
          <Block key={block.id} block={block} markdownStyles={markdownStyles} sources={sources} />
        ))
      )}
      {/* `CanvasSourcePills` renders nothing at all for an empty list — silence, not an empty row. */}
      <CanvasSourcePills pills={pills} testID="canvas-document-sources" />
    </View>
  );
}

function Block({
  block,
  markdownStyles,
  sources,
}: {
  block: StoredCanvasBlock;
  markdownStyles: Parameters<typeof MessageBody>[0]["styles"];
  /** 🔴 ALWAYS PASSED, POSSIBLY EMPTY, NEVER OMITTED. `MessageBody` reads `sources !== undefined`
   *  as "this is an assistant answer" — the flag that lets it demote a bare URL to a named chip.
   *  A canvas block IS an assistant answer, written by the same turn that would have rendered it
   *  live, so leaving this off would make a reopened canvas print the raw address the live reply
   *  had already tidied away. An empty array is the correct value for a canvas that cited nothing. */
  sources: ChatSource[];
}) {
  const styles = useThemedStyles(createStyles);
  switch (block.type) {
    case "heading":
      return (
        <Text style={styles.heading} accessibilityRole="header">
          {block.content}
        </Text>
      );
    case "question":
      // The web's `--canvas-text-question`: 20px, line-height 1.4, weight 500, centred. A question
      // put to the learner is the one thing on a canvas that is addressed to them rather than
      // about the subject, and it is set differently so it reads that way.
      return <Text style={styles.question}>{block.content}</Text>;
    case "callout":
      return (
        <View style={styles.callout}>
          <MessageBody content={block.content} styles={markdownStyles} sources={sources} />
        </View>
      );
    case "citation":
      return <Text style={styles.citation}>{block.content}</Text>;
    default:
      // paragraph · concept · example — prose, through the same markdown treatment every other
      // reading surface in the app uses, so a passage looks identical wherever the student meets it.
      return (
        <View style={styles.passage}>
          <MessageBody content={block.content} styles={markdownStyles} sources={sources} />
        </View>
      );
  }
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    doc: { paddingHorizontal: space(4), gap: space(3) },
    heading: { fontSize: CANVAS_TEXT.title, lineHeight: 30, fontWeight: "600", color: c.text, marginTop: space(2) },
    question: {
      fontSize: CANVAS_TEXT.question,
      lineHeight: 28,
      fontWeight: "500",
      color: c.text,
      textAlign: "center",
      marginVertical: space(3),
      paddingHorizontal: space(2),
    },
    callout: {
      borderLeftWidth: 2,
      borderLeftColor: c.line2,
      paddingLeft: space(3),
    },
    citation: { fontSize: CANVAS_TEXT.small, lineHeight: 20, color: c.text3 },
    passage: {},
    empty: { fontSize: CANVAS_TEXT.body, lineHeight: 24, color: c.text3, textAlign: "center", marginTop: space(10) },
  });
