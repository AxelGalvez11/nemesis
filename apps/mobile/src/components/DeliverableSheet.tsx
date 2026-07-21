import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SlideUpSheet } from "./StudySheet";
import { MissionButton } from "./mission-ui";
import type { ChatOutput } from "@/lib/chat-thread";
import { polishState } from "@/lib/recording";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Deliverable chips (chat.tsx) — a thread-level row at the top of the
// transcript for chat_threads.meta.outputs (session artifacts, e.g. a
// Record-mode recording) and a per-message row under any assistant turn that
// carries chat_messages.meta.outputs — plus the bottom-up sheet either kind
// of chip opens. SCOPE NOTE: the phone Chat surface does not execute tools,
// so outputs here come from web's Record mode OR the phone's own Record
// screen (app/record.tsx via api/chat.ts saveRecordingArtifact) — today
// that's effectively only kind:"recording" (web's flashcards/slides/test/
// report kinds are declared in the shared type but not yet produced by any
// chat surface; see lib/chat-thread.ts's ChatOutput doc). This component
// itself stays a display layer.

const OUTPUT_CHIP_LABEL: Record<ChatOutput["kind"], string> = {
  flashcards: "Deck created",
  other: "Output",
  recording: "Recording",
  report: "Report",
  slides: "Slides created",
  test: "Test created",
};

const OUTPUT_KIND_LABEL: Record<ChatOutput["kind"], string> = {
  flashcards: "Flashcards",
  other: "Output",
  recording: "Recording",
  report: "Report",
  slides: "Slides",
  test: "Test",
};

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

/** A horizontal row of deliverable chips — used BOTH as the thread-level
 *  ListHeaderComponent (chat_threads.meta.outputs) and under a single message
 *  (chat_messages.meta.outputs), so the two call sites in chat.tsx share one
 *  rendering + one wording. */
export function DeliverableChipRow({ outputs, onSelect }: { outputs: ChatOutput[]; onSelect: (output: ChatOutput) => void }) {
  const styles = useThemedStyles(createStyles);
  if (!outputs.length) return null;
  return (
    <View style={styles.chipRow} testID="chat-deliverables-row">
      {outputs.map((output) => (
        <Pressable
          key={output.id}
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
          onPress={() => onSelect(output)}
          testID={`chat-deliverable-chip-${output.id}`}
        >
          <Text style={styles.chipText} numberOfLines={1}>
            {polishState(output, new Date()) === "pending"
              ? `${OUTPUT_CHIP_LABEL[output.kind]} · Polishing…`
              : OUTPUT_CHIP_LABEL[output.kind]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function DeliverableSheet({ visible, onClose, output }: { visible: boolean; onClose: () => void; output: ChatOutput | null }) {
  const styles = useThemedStyles(createStyles);
  // NEVER early-return before the SlideUpSheet render: `output` goes null the
  // SAME render pass `visible` flips to false (chat.tsx's onClose clears both
  // together), and SlideUpSheet is designed to stay mounted through its own
  // close fade (see its doc — "no first-open flicker"). Optional-chain every
  // field instead, same posture as UpgradeSheet's message fallback.
  const kindLabel = output ? OUTPUT_KIND_LABEL[output.kind] : "";
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
          <Text style={styles.polishLine} testID="chat-deliverable-polishing">
            Polishing transcript — a high-accuracy version replaces this text automatically.
          </Text>
        ) : null}
        {output?.notes ? (
          <>
            <Text style={styles.sectionHead}>Notes</Text>
            <Text style={styles.contentText}>{output.notes}</Text>
          </>
        ) : null}
        {output?.transcript ? (
          <>
            <Text style={styles.sectionHead}>Transcript</Text>
            <Text style={styles.contentText}>{output.transcript}</Text>
          </>
        ) : null}
        {output && !output.notes && !output.transcript ? <Text style={styles.mutedText}>No content preview for this deliverable.</Text> : null}
        <View style={styles.buttons}>
          {output?.kind === "flashcards" ? (
            <MissionButton
              label="Open Study"
              variant="primary"
              onPress={() => {
                onClose();
                router.push("/study");
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
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space(1.5), marginTop: space(1.5), paddingHorizontal: space(0.5) },
    chip: { paddingVertical: space(1), paddingHorizontal: space(2.5), borderRadius: radius.pill, borderWidth: 1, borderColor: c.accentLine, backgroundColor: c.accentFaint },
    chipPressed: { backgroundColor: c.surface2 },
    chipText: { ...type.small, color: c.accent, fontWeight: "600" },
    body: { maxHeight: 460 },
    meta: { ...type.micro, color: c.text3, marginBottom: space(3) },
    polishLine: { ...type.small, color: c.accent, marginBottom: space(3), lineHeight: 19 },
    sectionHead: { ...type.micro, color: c.text2, letterSpacing: 1.1, textTransform: "uppercase", marginTop: space(2), marginBottom: space(1) },
    contentText: { ...type.small, color: c.text, lineHeight: 22 },
    mutedText: { ...type.small, color: c.text3, paddingVertical: space(2) },
    buttons: { flexDirection: "row", gap: space(2.5), marginTop: space(4) },
  });
