import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { FileIcon } from "@/components/icons";
import { MessageBody } from "@/components/MessageBody";
import type { CanvasThreadTurn } from "@/learn/web";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// One finished turn of a canvas, drawn the way the iOS reference draws a chat turn: the
// learner's words as a right-aligned bubble, Nemesis's reply full-width underneath with no
// bubble at all (chat.tsx's own UserTurn/assistant split, mirrored here for a canvas's turns
// instead of a chat thread's messages).
//
// Visuals and outputs (CanvasThreadTurn.visuals / .output) are NOT drawn yet — this slice's
// askCanvas is the "honest minimum" plain-reply endpoint (see api/canvases.ts's CANVAS_SYSTEM
// comment) and never produces either. Rendering them is slice 2/3, once the canvas composer
// runs the web's own teaching turn instead of a bare completion.

export function CanvasTurn({
  turn,
  capabilityLabel,
  onLongPressReply,
}: {
  turn: CanvasThreadTurn;
  /** Only ever set for the very first turn of a session that opened via the front door's
   *  capability chip — see canvas.tsx's capForFirstTurnRef for why it never survives a reload. */
  capabilityLabel?: string | null;
  onLongPressReply?: (x: number, y: number, text: string) => void;
}) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const markdownStyles = useThemedStyles(createMarkdownStyles);
  const spoken = turn.saidVia === "spoken";
  const said = turn.said?.trim() ?? "";
  const reply = turn.reply.trim();

  return (
    <View style={styles.wrap}>
      {turn.attached.length ? (
        <View style={styles.attachedRow}>
          {turn.attached.map((title, index) => (
            <View key={`${title}-${index}`} style={styles.attachedChip}>
              <FileIcon size={12} color={c.text2} strokeWidth={1.6} />
              <Text numberOfLines={1} style={styles.attachedChipText}>
                {title}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {said ? (
        <View style={styles.userTurn}>
          <View style={[styles.bubble, spoken && styles.bubbleSpoken]}>
            {capabilityLabel ? (
              <View style={styles.capChip}>
                <Text style={styles.capChipText}>{capabilityLabel}</Text>
              </View>
            ) : null}
            <Text style={[styles.bubbleText, spoken && styles.bubbleTextSpoken]}>{said}</Text>
          </View>
        </View>
      ) : null}
      {reply ? (
        <Pressable
          delayLongPress={350}
          onLongPress={(e: GestureResponderEvent) => onLongPressReply?.(e.nativeEvent.pageX, e.nativeEvent.pageY, reply)}
        >
          <View style={styles.replyWrap}>
            <MessageBody content={turn.reply} styles={markdownStyles} />
          </View>
        </Pressable>
      ) : null}
      {turn.truncated ? <Text style={styles.truncatedNote}>Shortened to fit</Text> : null}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { alignSelf: "stretch", gap: space(1.5) },
    attachedRow: { flexDirection: "row", flexWrap: "wrap", gap: space(1.5), justifyContent: "flex-end" },
    attachedChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(1),
      maxWidth: 200,
      paddingHorizontal: space(2.5),
      paddingVertical: space(1),
      borderRadius: radius.pill,
      backgroundColor: c.surface2,
    },
    attachedChipText: { ...type.micro, color: c.text2 },
    userTurn: { alignSelf: "stretch", alignItems: "flex-end" },
    // "Accent bubble" per the reference — the app's own accent (Appearance settings), never a
    // hardcoded color, same rule Composer's record button follows.
    bubble: { maxWidth: "86%", borderRadius: radius.lg, paddingHorizontal: space(3.5), paddingVertical: space(2.5), backgroundColor: c.accent, gap: space(1) },
    bubbleSpoken: { opacity: 0.82 },
    bubbleText: { ...type.body, color: c.onAccent },
    bubbleTextSpoken: { fontStyle: "italic" },
    capChip: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: space(2), paddingVertical: space(0.5), backgroundColor: "rgba(255,255,255,0.22)" },
    capChipText: { ...type.micro, color: c.onAccent, fontWeight: "600" },
    // Full-width, no bubble — the reply is the canvas's own content, not a message about it.
    replyWrap: { alignSelf: "stretch", paddingHorizontal: space(0.5), paddingVertical: space(1) },
    truncatedNote: { ...type.micro, color: c.text3, alignSelf: "flex-end" },
  });
