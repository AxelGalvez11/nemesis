import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useKeepAwake } from "expo-keep-awake";
import { enhanceRecordingArtifact, saveRecordingArtifact } from "@/api/chat";
import { GlassSurface } from "@/components/GlassSurface";
import { MicIcon } from "@/components/icons";
import { MissionButton } from "@/components/mission-ui";
import { liveNotesText } from "@/lib/live-notes";
import { buildRecordingDraft, formatRecordingClock, fullTranscript, hasTranscript } from "@/lib/recording";
import { useLiveNotes } from "@/hooks/useLiveNotes";
import { useLiveTranscription } from "@/hooks/useLiveTranscription";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Record session (phone half of web's Record mode): live on-device transcription of a
// lecture or study session, saved into the open chat as the same recording
// artifact web creates — so it shows up as a chip in this chat on every
// device. Speech never leaves the phone (SFSpeechRecognizer on-device, same
// engine as chat dictation) and no transcription minutes are billed.
//
// Extracted out of app/record.tsx (owner 2026-07-21, "chat/recorder toggle
// from the webapp") so the SAME session — header, transcript, live notes,
// status line, three-state control bar — can render two ways: standalone as
// the full-screen modal (app/record.tsx, still routed via the "+" menu's
// "Record" row, unchanged) AND inline as chat.tsx's swapped-in record
// workspace when the composer's mode pill flips to "Record" (mirrors web's
// composer.tsx ModePill swapping in record-workspace.tsx). This component
// owns every hook and every testID from the original screen; it does NOT own
// "screen chrome" — safe-area insets and outer background differ per host, so
// callers wrap it in their own padded View (see both call sites).
export type RecordingSessionState = "idle" | "recording" | "reviewable";

export interface RecordSessionProps {
  userId: string | null;
  threadId: string | null;
  /** Fires once, after Save lands, after a confirmed Discard, or after Close —
   *  the host's cue to leave record mode (router.back() for the modal,
   *  flip composerMode back to "chat" for the inline case). */
  onDone: () => void;
  /** Fires whenever the three-state UI transitions — lets a host (chat.tsx)
   *  lock its own mode-switch control while a recording is live or has an
   *  unsaved transcript, without duplicating this component's state. */
  onRecordingStateChange?: (state: RecordingSessionState) => void;
}

export function RecordSession({ userId, threadId, onDone, onRecordingStateChange }: RecordSessionProps) {
  // A lecture is longer than the auto-lock timeout; keep the screen on while
  // this is mounted, since backgrounding would stop recognition.
  useKeepAwake();
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);

  const live = useLiveTranscription();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const notesScrollRef = useRef<ScrollView>(null);

  const recording = live.status === "recording";
  const reviewable = live.status === "stopped" && hasTranscript(live.transcript);
  const liveNotes = useLiveNotes(userId, fullTranscript(live.transcript), recording);

  // Keep the newest words in view as they stream in.
  useEffect(() => {
    if (recording) scrollRef.current?.scrollToEnd({ animated: true });
  }, [recording, live.transcript]);

  // Report the three-state UI up to the host so it can lock its own mode
  // toggle — only on actual transitions (recording ⇄ reviewable ⇄ idle), not
  // on every transcript-growing re-render.
  const sessionState: RecordingSessionState = recording ? "recording" : reviewable ? "reviewable" : "idle";
  useEffect(() => {
    onRecordingStateChange?.(sessionState);
  }, [sessionState, onRecordingStateChange]);

  const discard = useCallback(() => {
    if (recording || hasTranscript(live.transcript)) {
      Alert.alert("Discard recording?", "The transcript from this recording will be lost.", [
        { style: "cancel", text: "Keep recording" },
        { onPress: onDone, style: "destructive", text: "Discard" },
      ]);
      return;
    }
    onDone();
  }, [recording, live.transcript, onDone]);

  const save = useCallback(async () => {
    if (!userId || !threadId || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const entry = await saveRecordingArtifact(
        userId,
        threadId,
        buildRecordingDraft(live.transcript, live.elapsedSeconds, new Date(), liveNotesText(liveNotes.notes)),
      );
      // Enhance pass runs detached: the saved on-device transcript is already
      // safe, and the sharper server transcript swaps in when it lands.
      void enhanceRecordingArtifact(userId, threadId, entry, live.audioUris, live.elapsedSeconds);
      onDone();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Couldn't save the recording — check your connection and try again.");
      setSaving(false);
    }
  }, [userId, threadId, saving, live.transcript, live.elapsedSeconds, live.audioUris, liveNotes.notes, onDone]);

  const statusLine =
    live.status === "denied"
      ? "Microphone or speech recognition is turned off for Nemesis. Enable both in iOS Settings, then try again."
      : live.status === "error"
        ? "Live transcription isn't available right now. Try again in a moment."
        : live.status === "recording"
          ? "Listening — speech is transcribed on this phone and never uploaded as audio."
          : live.status === "stopped" && !reviewable
            ? "Nothing was transcribed. Start again and speak close to the phone."
            : reviewable
              ? "Saving keeps this transcript and runs a high-accuracy pass that sharpens it moments later."
              : "Transcribes on this phone as you record, then saves the transcript into this chat.";

  return (
    <View style={styles.session}>
      <View style={styles.header}>
        <View style={styles.headerLead}>
          <MicIcon color={recording ? c.accent : c.text2} size={19} />
          <Text style={styles.title}>Record</Text>
        </View>
        <Text style={[styles.clock, recording && { color: c.accent }]}>{formatRecordingClock(live.elapsedSeconds)}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.transcriptContent}
        onContentSizeChange={() => {
          if (recording) scrollRef.current?.scrollToEnd({ animated: true });
        }}
        ref={scrollRef}
        style={styles.transcript}
      >
        {live.transcript.finals.map((paragraph, index) => (
          <Text key={index} style={styles.paragraph}>
            {paragraph}
          </Text>
        ))}
        {live.transcript.interim.trim().length > 0 && <Text style={[styles.paragraph, { color: c.text3 }]}>{live.transcript.interim}</Text>}
        {!hasTranscript(live.transcript) && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>
              {recording ? "Start speaking — the transcript builds here as you go." : "Record a lecture or a study session. The live transcript appears here."}
            </Text>
          </View>
        )}
      </ScrollView>

      {liveNotes.notes.length > 0 && (
        <View style={styles.notesPanel} testID="record-live-notes">
          <Text style={styles.notesHead}>Live notes</Text>
          <ScrollView
            contentContainerStyle={styles.notesContent}
            onContentSizeChange={() => {
              if (recording) notesScrollRef.current?.scrollToEnd({ animated: true });
            }}
            ref={notesScrollRef}
            style={styles.notesScroll}
          >
            {liveNotes.notes.map((note, index) => (
              <Text key={index} style={styles.noteLine}>{`- ${note}`}</Text>
            ))}
          </ScrollView>
        </View>
      )}

      <Text style={styles.statusLine}>{statusLine}</Text>
      {saveError ? <Text style={styles.errorLine}>{saveError}</Text> : null}

      <GlassSurface fallbackColor={c.glassPanel} style={styles.controls} shadow>
        {recording ? (
          <View style={styles.controlRow}>
            <View style={styles.liveDot} />
            <Text style={styles.controlHint}>Recording</Text>
            <View style={styles.controlSpacer} />
            <MissionButton label="Stop" onPress={live.stop} testID="record-stop" variant="primary" />
          </View>
        ) : reviewable ? (
          <View style={styles.controlRow}>
            <MissionButton label="Discard" onPress={discard} testID="record-discard" variant="secondary" />
            <View style={styles.controlSpacer} />
            <MissionButton busy={saving} label={saving ? "Saving…" : "Save to chat"} onPress={() => void save()} testID="record-save" variant="primary" />
          </View>
        ) : (
          <View style={styles.controlRow}>
            <MissionButton label="Close" onPress={discard} testID="record-close" variant="secondary" />
            <View style={styles.controlSpacer} />
            <MissionButton
              disabled={!userId || !threadId || live.status === "denied"}
              label="Start recording"
              onPress={() => {
                liveNotes.reset();
                void live.start();
              }}
              testID="record-start"
              variant="primary"
            />
          </View>
        )}
      </GlassSurface>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // No backgroundColor/top-bottom inset padding here — that's "screen chrome"
    // and differs per host (full-screen modal vs. inline chat panel); see both
    // call sites (app/record.tsx, app/(tabs)/chat.tsx).
    session: { flex: 1, backgroundColor: c.bg, paddingHorizontal: space(4), paddingTop: space(3) },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: space(3) },
    headerLead: { flexDirection: "row", alignItems: "center", gap: space(2) },
    title: { ...type.title, color: c.text },
    clock: { fontSize: 16, fontVariant: ["tabular-nums"], color: c.text2, fontWeight: "600" },
    transcript: { flex: 1, borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
    transcriptContent: { padding: space(4), gap: space(3), flexGrow: 1 },
    paragraph: { ...type.body, color: c.text },
    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space(6) },
    emptyText: { ...type.body, color: c.text3, textAlign: "center", fontSize: 15, lineHeight: 22 },
    notesPanel: { marginTop: space(3), borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, maxHeight: 190 },
    notesHead: { ...type.micro, color: c.text2, letterSpacing: 1.1, textTransform: "uppercase", paddingHorizontal: space(4), paddingTop: space(3) },
    notesScroll: { flexGrow: 0 },
    notesContent: { paddingHorizontal: space(4), paddingTop: space(2), paddingBottom: space(3), gap: space(1.5) },
    noteLine: { ...type.small, color: c.text, lineHeight: 20 },
    statusLine: { color: c.text3, fontSize: 12.5, lineHeight: 18, paddingVertical: space(3), textAlign: "center" },
    errorLine: { color: c.accent, fontSize: 12.5, lineHeight: 18, paddingBottom: space(2), textAlign: "center" },
    controls: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden", padding: space(3) },
    controlRow: { flexDirection: "row", alignItems: "center", gap: space(3) },
    controlSpacer: { flex: 1 },
    liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent },
    controlHint: { ...type.body, color: c.text2, fontSize: 15 },
  });
