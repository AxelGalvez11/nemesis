import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SlideUpSheet } from "./StudySheet";
import { MissionButton } from "./mission-ui";
import { CalendarIcon, ChevronIcon, FileIcon, LibraryIcon, MicIcon, StudyIcon } from "./icons";
import { artifactCard } from "@/lib/artifact-card";
import type { ChatOutput } from "@/lib/chat-thread";
import { polishState } from "@/lib/recording";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Deliverable cards (chat.tsx) — a thread-level row at the top of the
// transcript for chat_threads.meta.outputs (session artifacts, e.g. a
// Record-mode recording) and a per-message row under any assistant turn that
// carries chat_messages.meta.outputs — plus the bottom-up sheet a card with
// nowhere to navigate opens instead.
//
// Outputs reach here from THREE places: the phone's own chat tools
// (api/agentTools.ts, since the tool lane landed), the phone's Record screen
// (api/chat.ts saveRecordingArtifact), and web's Record mode, synced down.
//
// Owner 2026-07-27: a created deck used to render as a bare pill reading "Deck
// created" — no name, no destination, and identical to every other deck the
// student had ever made. The wording now comes from lib/artifact-card.ts,
// which is pure and tested; this file stays a display layer.

/** The icon says WHERE the card goes, matching its destination line, rather
 *  than what kind of object it is — the card's whole job is the routing. A
 *  recording is the exception: it has no page to land on, so it keeps the mic
 *  that says what it is. */
function ArtifactIcon({ kind, where, color }: { kind: ChatOutput["kind"]; where: string; color: string }) {
  if (kind === "recording") return <MicIcon size={18} color={color} />;
  if (where.startsWith("Study")) return <StudyIcon size={18} color={color} />;
  if (where === "Library") return <LibraryIcon size={18} color={color} />;
  if (where === "Calendar") return <CalendarIcon size={18} color={color} />;
  return <FileIcon size={18} color={color} />;
}

/** A slow breathe for a card whose work is still running (owner 2026-07-30:
 *  "it should show a processing artifact with a pulsing animation, not just a
 *  regular artifact"). Built on RN's own Animated, the same zero-dep posture as
 *  Skeleton.tsx — reanimated stays reserved for gestures.
 *
 *  The floor is 0.5 rather than Skeleton's 0.35 because this card carries a
 *  title the student is meant to read while it pulses; a skeleton has no words
 *  to lose. Legs are 900ms, slower than a loading shimmer, because this stands
 *  for a minutes-long job rather than a page that is about to appear. */
function usePulse(active: boolean): Animated.Value {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) {
      // Settle at full strength — a card that finished mid-fade would keep
      // whatever partial opacity the loop was stopped on.
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      opacity.setValue(1);
    };
  }, [active, opacity]);
  return opacity;
}

function formatCreatedAt(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { day: "numeric", hour: "numeric", minute: "2-digit", month: "short" });
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** A stack of deliverable cards — used BOTH as the thread-level
 *  ListHeaderComponent (chat_threads.meta.outputs) and under a single message
 *  (chat_messages.meta.outputs), so the two call sites in chat.tsx share one
 *  rendering + one wording.
 *
 *  Full width and stacked rather than a wrapping pill row: the card now carries
 *  a name and a destination, and a pill that has to hold both either truncates
 *  the name or leaves an orphan on the next line.
 *
 *  `compact` is for the THREAD-LEVEL header, where every row is a recording the
 *  student made in this conversation. A three-line card is right under a single
 *  answer and wrong as a header: a thread with four recordings would open on
 *  ~360pt of chrome before the first message. One line each keeps it to a
 *  quarter of that, and the kicker/destination earn their space least there —
 *  the rows are all the same kind, and a recording has nowhere to route to. */
export function DeliverableCardStack(
  { outputs, onSelect, compact = false }: { outputs: ChatOutput[]; onSelect: (output: ChatOutput) => void; compact?: boolean },
) {
  const styles = useThemedStyles(createStyles);
  if (!outputs.length) return null;
  return (
    <View style={styles.cardStack} testID="chat-deliverables-row">
      {outputs.map((output) => (
        <ArtifactRow key={output.id} output={output} onSelect={onSelect} compact={compact} />
      ))}
    </View>
  );
}

/** One card. Its own component rather than a loop body because the pulse is a
 *  hook, and a hook cannot live inside a `.map()`. */
function ArtifactRow(
  { output, onSelect, compact }: { output: ChatOutput; onSelect: (output: ChatOutput) => void; compact: boolean },
) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const card = artifactCard(output);
  // A recording being re-transcribed says so IN PLACE of its destination: the
  // text it holds is about to be replaced, so "tap to read" would be pointing
  // at something that is still changing. lib/artifact-timeline.ts is what keeps
  // this honest — it resolves each card to the artifact's NEWEST state, so a
  // "pending" copy frozen in an old chat message cannot leave this pulsing
  // after the notes have landed.
  const polishing = polishState(output, new Date()) === "pending";
  const opacity = usePulse(polishing);
  return (
    <Animated.View style={{ opacity }}>
      <Pressable
        style={({ pressed }) => [styles.card, compact && styles.cardCompact, pressed && styles.cardPressed]}
        onPress={() => onSelect(output)}
        accessibilityRole="button"
        // The kicker is gone from the face of the card (see createStyles) but
        // stays here: VoiceOver has no icon to read, so dropping it would leave
        // a card that announces a bare title with no idea what kind of thing it
        // is. "Working" first, because that is the part that changes.
        accessibilityLabel={`${polishing ? "Still working. " : ""}${card.kicker}: ${card.title}. ${polishing ? "Transcribing and polishing notes" : card.where}`}
        testID={`chat-deliverable-card-${output.id}`}
      >
        <View style={styles.cardIcon}>
          <ArtifactIcon kind={output.kind} where={card.where} color={colors.text} />
        </View>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle} numberOfLines={compact ? 1 : 2}>
            {card.title}
          </Text>
          {compact && !polishing ? null : (
            <Text style={styles.cardWhere} numberOfLines={1}>
              {polishing ? "Transcribing and polishing notes…" : card.where}
            </Text>
          )}
        </View>
        <View style={styles.cardChevron}>
          <ChevronIcon size={16} color={colors.text} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function DeliverableSheet({ visible, onClose, output }: { visible: boolean; onClose: () => void; output: ChatOutput | null }) {
  const styles = useThemedStyles(createStyles);
  // NEVER early-return before the SlideUpSheet render: `output` goes null the
  // SAME render pass `visible` flips to false (chat.tsx's onClose clears both
  // together), and SlideUpSheet is designed to stay mounted through its own
  // close fade (see its doc — "no first-open flicker"). Optional-chain every
  // field instead, same posture as UpgradeSheet's message fallback.
  // Same wording table the card uses, so the sheet's heading cannot disagree
  // with the card the student just tapped.
  const kindLabel = output ? artifactCard(output).kicker : "";
  const polish = output ? polishState(output, new Date()) : "none";
  const meta = output
    ? [kindLabel, formatDuration(output.durationSeconds), formatCreatedAt(output.createdAt), polish === "done" ? "Polished" : ""]
        .filter(Boolean)
        .join(" · ")
    : "";
  return (
    <SlideUpSheet visible={visible} onClose={onClose} title={output?.title || kindLabel} testID="chat-deliverable-sheet">
      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        {polish === "pending" ? (
          <View style={styles.polishPreview} testID="chat-deliverable-polishing">
            <View style={styles.polishHeader}>
              <ActivityIndicator color={styles.polishLine.color} size="small" />
              <Text style={styles.polishLine}>Preparing high-quality notes…</Text>
            </View>
            <View style={[styles.previewLine, { width: "92%" }]} />
            <View style={[styles.previewLine, { width: "78%" }]} />
            <View style={[styles.previewLine, { width: "86%" }]} />
            <Text style={styles.previewCaption}>The finished notes will replace this preview automatically and stay linked to this chat.</Text>
          </View>
        ) : null}
        {output?.notes ? (
          <>
            <Text style={styles.sectionHead}>Notes</Text>
            <Text style={styles.contentText}>{output.notes}</Text>
          </>
        ) : null}
        {output && !output.notes ? (
          <Text style={styles.mutedText}>
            {output.kind === "recording" ? "Notes are being prepared in your Library." : "No content preview for this deliverable."}
          </Text>
        ) : null}
        <View style={styles.buttons}>
          {output?.route ? (
            <MissionButton
              // Named off the same routing table the card uses, so the sheet
              // cannot promise "Open note" for a saved calendar event.
              label={artifactCard(output).place ? `Open in ${artifactCard(output).place}` : "Open"}
              variant="primary"
              onPress={() => {
                onClose();
                router.push(output.route as never);
              }}
              testID="chat-deliverable-open-study"
            />
          ) : null}
          {output?.url ? (
            <MissionButton
              label="Open"
              variant="secondary"
              onPress={() => void Linking.openURL(output.url as string).catch(() => {})}
              testID="chat-deliverable-open-url"
            />
          ) : null}
        </View>
        <View style={{ height: space(4) }} />
      </ScrollView>
    </SlideUpSheet>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    cardStack: { gap: space(1.5), marginTop: space(2), paddingHorizontal: space(0.5) },
    // 🔴 NEUTRAL, NOT ACCENT (owner 2026-07-30: "all artifacts should be gray
    // and give it a modern minimal look"). This used to fill with accentFaint
    // and outline with accentLine, which is the student's chosen accent at 12%
    // and 35% — on a blue accent every artifact in the transcript read as a
    // blue callout box competing with the answer above it. An artifact is a
    // quiet destination, not an alert, so it now sits on the same neutral
    // surface as every other card in the app and is separated from the page by
    // a hairline instead of a coloured outline.
    //
    // Do NOT reach back for the accent family here to "bring it to life" — the
    // accent earns its place on things the student ACTS on (primary buttons,
    // the record control), and spending it on a passive row is what made this
    // loud in the first place.
    card: {
      flexDirection: "row", alignItems: "center", gap: space(2.5),
      paddingVertical: space(2.5), paddingHorizontal: space(3),
      borderRadius: radius.md, borderCurve: "continuous",
      borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, backgroundColor: c.surface2,
    },
    cardCompact: { paddingVertical: space(1.75) },
    cardPressed: { backgroundColor: c.raised },
    // Fixed so the text lines start on the same x whatever the glyph is. The
    // opacity is how the icon reads as grey without a grey COLOUR: the palette
    // flattened every text tier to pure black/white on purpose (owner
    // 2026-07-21, "no gray text anywhere"), so tinting is done with alpha.
    cardIcon: { width: 20, alignItems: "center", opacity: 0.45 },
    // minWidth:0 is what lets numberOfLines truncate instead of pushing the
    // chevron off the card — a flex child's default min-width is its content.
    cardText: { flex: 1, minWidth: 0, gap: space(0.5) },
    // The KICKER LINE IS GONE from the card face — "RECORDING" in accent caps
    // above a title that already says "Recording · Jul 30" was the same fact
    // twice, and it is the icon's whole job besides. artifactCard().kicker is
    // still read by the sheet's heading and by the card's accessibility label,
    // so nothing lost the information — only the row lost a line.
    cardTitle: { ...type.small, color: c.text, fontWeight: "600" },
    // `color: c.text3` alone does NOTHING — all three text tiers are pure
    // black/white since the grey ramp was killed. Opacity is the house way to
    // make something read as secondary. 0.5, not the 0.16 the calendar's
    // out-of-month days use: that number is for a number you are meant to skip
    // over, and this is a line you are meant to read.
    cardWhere: { ...type.micro, color: c.text3, opacity: 0.5 },
    cardChevron: { opacity: 0.35 },
    // Height is owned by SlideUpSheet's body (collapsed cap + drag-up-to-
    // expand, owner 2026-07-21); flexShrink lets the scroll area compress to
    // that animated cap instead of overflowing it.
    body: { flexShrink: 1 },
    meta: { ...type.micro, color: c.text3, marginBottom: space(3) },
    // Neutral for the same reason the card is (see `card` above): "still
    // working" is a status, and statuses do not get to wear the accent.
    polishLine: { ...type.small, color: c.text, lineHeight: 19 },
    polishPreview: {
      gap: space(2), padding: space(3), borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth, borderColor: c.line,
      backgroundColor: c.surface2, marginBottom: space(3),
    },
    polishHeader: { flexDirection: "row", alignItems: "center", gap: space(2) },
    previewLine: { height: 9, borderRadius: radius.pill, backgroundColor: c.skeleton },
    previewCaption: { ...type.micro, color: c.text3, lineHeight: 17, marginTop: space(1) },
    sectionHead: { ...type.micro, color: c.text2, letterSpacing: 1.1, textTransform: "uppercase", marginTop: space(2), marginBottom: space(1) },
    contentText: { ...type.small, color: c.text, lineHeight: 22 },
    mutedText: { ...type.small, color: c.text3, paddingVertical: space(2) },
    buttons: { flexDirection: "row", gap: space(2.5), marginTop: space(4) },
  });
