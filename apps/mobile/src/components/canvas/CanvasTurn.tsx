import type { ComponentType } from "react";
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { AttachedFileCard, DeliverableList } from "@/components/canvas/AttachmentCard";
import { CanvasActionRow } from "@/components/canvas/CanvasActionRow";
import { DocumentIcon, GlobeIcon, MapIcon, PdfIcon, SlidesIcon, TableIcon, TelescopeIcon, type IconProps } from "@/components/icons";
import { MessageBody } from "@/components/MessageBody";
import { CAPABILITY_COPY, type CanvasSource, type CanvasThreadTurn, type ComposerCapability, type ThreadSource } from "@/learn/web";
import { groundedReplyMarkdown } from "@/lib/citation-pills";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { inset, space, type } from "@/theme/tokens";

// One turn of a canvas, drawn the way the iOS reference draws a chat turn (IMG_6532/6542/6559):
// the learner's words as a right-aligned bubble with any attached-file card above it, Nemesis's
// reply full-width underneath with no bubble, deliverable cards under the prose, and an action
// row (copy/rate/share/…/Sources) once the reply has actually finished.

/** Which icons.tsx glyph draws each capability's inline badge — same pairing
 *  ComposerPlusMenu.tsx uses for the "+" menu, kept local rather than shared: this row draws
 *  it BLUE only (the reference's "Presentations" chip, IMG_6550/6551), not the six-hue kind
 *  system that menu applies to its own rows. */
const CAPABILITY_ICON: Record<ComposerCapability, ComponentType<IconProps>> = {
  course: MapIcon,
  research: TelescopeIcon,
  search: GlobeIcon,
  document: DocumentIcon,
  pdf: PdfIcon,
  sheet: TableIcon,
  slides: SlidesIcon,
};

export function CanvasTurn({
  turn,
  capability,
  documents = [],
  live = false,
  onLongPressReply,
  onOpenSources,
}: {
  turn: CanvasThreadTurn;
  /** Only ever set for the very first turn of a session that opened via the front door's
   *  capability chip — see canvas.tsx's capForFirstTurnRef for why it never survives a reload. */
  capability?: ComposerCapability | null;
  /** The canvas's attached documents, so a `[s1:e4]` marker in the reply's prose resolves to a
   *  pill naming the source it cites — same rule the web's `CanvasThreadTurnView` states for its
   *  own `files` prop: this is `canvas.sources`, not a field on the turn. The same shelf backs
   *  every answer in the thread, and copying it onto each turn would let per-turn copies disagree
   *  the moment a source was renamed. A marker naming a source not in this list is dropped, never
   *  shown raw — see `citation-pills.ts`'s `groundedReplyMarkdown`. */
  documents?: readonly CanvasSource[];
  /** True for the streaming row canvas.tsx draws while a reply is in flight — no action row,
   *  no long-press menu, no timestamp (there isn't a landed moment yet to time-stamp). */
  live?: boolean;
  /** Long-press on the reply AND the action row's "…" both land here — the reference opens the
   *  same menu from either (item 8's brief). Receives the press point and the turn itself, not
   *  just its text, so the menu can show the turn's own timestamp and re-run it for Retry. */
  onLongPressReply?: (x: number, y: number, turn: CanvasThreadTurn) => void;
  onOpenSources?: (sources: readonly ThreadSource[]) => void;
}) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const markdownStyles = useThemedStyles(createMarkdownStyles);
  const spoken = turn.saidVia === "spoken";
  const said = turn.said?.trim() ?? "";
  const reply = turn.reply.trim();
  const CapIcon = capability ? CAPABILITY_ICON[capability] : null;
  const capLabel = capability ? CAPABILITY_COPY[capability].label : null;
  const deliverables = turn.output ? [turn.output.title] : [];
  // Stripped/pilled BEFORE it reaches MessageBody — the stored `turn.reply` keeps its raw
  // `[s1:e1]`/`[1]` markers (ReplyActions' copy/speak below still read `turn.reply` itself); only
  // what is DRAWN changes, same split the web's `CanvasThreadTurnView` keeps between `turn.reply`
  // and what it hands `AssistantMarkdown`. `turn.sources` is the web-result list in the numbering
  // the model was shown for THIS turn; `documents` is the canvas's whole document shelf.
  const groundedReply = reply ? groundedReplyMarkdown(reply, documents, turn.sources) : reply;

  const openMenuFromPress = (e: GestureResponderEvent) => onLongPressReply?.(e.nativeEvent.pageX, e.nativeEvent.pageY, turn);
  const openMenuFromRow = (x: number, y: number) => onLongPressReply?.(x, y, turn);

  return (
    <View style={styles.wrap}>
      {turn.attached.length ? (
        <View style={styles.attachedStack}>
          {turn.attached.map((title, index) => (
            <AttachedFileCard key={`${title}-${index}`} title={title} />
          ))}
        </View>
      ) : null}
      {said ? (
        <View style={styles.userTurn}>
          <View style={[styles.bubble, spoken && styles.bubbleSpoken]}>
            {capLabel && CapIcon ? (
              // One wrapping paragraph, not a chip above the text (IMG_6550/6551: "[icon]
              // Presentations create a presentation on heart failure" flows as one sentence,
              // wrapping under the label rather than under the icon). A row holds the icon at
              // the first line's height; the flex Text column carries every wrapped line.
              <View style={styles.capRow}>
                <View style={styles.capIcon}>
                  <CapIcon size={18} color={c.blue} />
                </View>
                <Text style={[styles.bubbleText, spoken && styles.bubbleTextSpoken, styles.capTextFlex]}>
                  <Text style={styles.capLabel}>{capLabel} </Text>
                  {said}
                </Text>
              </View>
            ) : (
              <Text style={[styles.bubbleText, spoken && styles.bubbleTextSpoken]}>{said}</Text>
            )}
          </View>
        </View>
      ) : null}
      {reply ? (
        <Pressable delayLongPress={350} onLongPress={openMenuFromPress} disabled={live}>
          <View style={styles.replyWrap}>
            <MessageBody content={groundedReply} styles={markdownStyles} webSources={turn.sources} />
          </View>
        </Pressable>
      ) : null}
      {!live && deliverables.length ? (
        <View style={styles.deliverableWrap}>
          <DeliverableList titles={deliverables} />
        </View>
      ) : null}
      {turn.truncated ? <Text style={styles.truncatedNote}>Shortened to fit</Text> : null}
      {!live && reply ? (
        <View style={styles.actionRowWrap}>
          <CanvasActionRow
            reply={turn.reply}
            sources={turn.sources}
            onOpenMenu={openMenuFromRow}
            onOpenSources={() => onOpenSources?.(turn.sources)}
          />
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { alignSelf: "stretch", gap: space(1.5) },
    attachedStack: { alignItems: "flex-end", gap: space(2) },
    userTurn: { alignSelf: "stretch", alignItems: "flex-end" },
    // Fill/text/radius/padding measured off IMG_6542 (`favicon_zoom.png` region): bg #DEF3E5
    // (== c.accentFaint for the Default accent), text darkest pixel #48A04C (== c.accentDim),
    // bubble height 45.7pt = 22 (line height) + 2×12 padding — exact match to the task's
    // 12×16/radius-20 spec, so those numbers are kept literal rather than re-derived from a
    // token that doesn't exist yet.
    bubble: { maxWidth: "75%", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.accentFaint },
    bubbleSpoken: { opacity: 0.82 },
    bubbleText: { ...type.label, color: c.accentDim },
    bubbleTextSpoken: { fontStyle: "italic" },
    capRow: { flexDirection: "row", alignItems: "flex-start", gap: space(1.5) },
    // Sized to the label's own line height (22) so the icon lines up with the FIRST line of
    // text without nudging every wrapped line under it (see the render comment above).
    capIcon: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
    // flexShrink, NOT flex — this bubble still shrink-wraps a short answer (a bare label with
    // nothing else said), and flex's implied flexGrow would stretch it to the full maxWidth
    // even then. flexShrink is what lets the text give way to the icon once the row would
    // otherwise overflow the bubble's maxWidth, which is what makes it wrap at all.
    capTextFlex: { flexShrink: 1 },
    capLabel: { fontWeight: "700" as const, color: c.blue },
    // Full-width, no bubble — the reply is the canvas's own content, not a message about it.
    // inset.answer (16) matches the reference's body-text left margin (measured, IMG_6532).
    replyWrap: { alignSelf: "stretch", paddingHorizontal: inset.answer, paddingVertical: space(1) },
    deliverableWrap: { paddingHorizontal: inset.answer, marginTop: space(1) },
    truncatedNote: { ...type.micro, color: c.text3, alignSelf: "flex-end" },
    actionRowWrap: { paddingHorizontal: inset.answer },
  });
