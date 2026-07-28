import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useKeepAwake } from "expo-keep-awake";
import { enhanceRecordingArtifact, saveRecordingArtifact } from "@/api/chat";
import { GlassSurface } from "@/components/GlassSurface";
import { MissionButton } from "@/components/mission-ui";
import { buildRecordingDraft, formatRecordingClock, hasTranscript } from "@/lib/recording";
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
// from the webapp") so the SAME session — transcript, live notes, status line
// — could render both as a full-screen modal and inline inside chat.tsx
// (mirrors web's composer.tsx swapping in record-workspace.tsx). The modal
// half is gone as of 2026-07-22: nothing had routed to it since record moved
// inline, and with start/stop now living on the composer it would have been a
// screen with no way to begin a recording. chat.tsx is the one host.
//
// This component owns every hook and every testID from the original screen; it
// does NOT own "screen chrome" — safe-area insets and outer background belong
// to the host, which wraps it in its own padded View.
//
// ONE BOX, ONE VIEW (owner 2026-07-27). This box used to carry a
// Transcript/Notes switch, because notes were written live while you spoke.
// They are not any more — a recording's notes are written once when it is
// saved, from the high-accuracy transcript (see lib/live-notes.ts for the cost
// and quality reasons). So the switch had nothing to switch to: a Notes tab
// that is empty for the whole lecture is worse than no tab, and the promise
// now lives in the status line instead. The screen's own LiveWaveform went
// earlier (owner 2026-07-22): the composer draws the one that reacts to the
// microphone.
//
// THE COMPOSER DRIVES START/STOP AND EXIT NOW (owner 2026-07-22): "remove the
// 'close' and 'stop recording' box, remove the 'record' and the microphone
// icon in the upper left". Those three controls moved onto the composer card
// (Composer.tsx's file header has the layout), so this workspace no longer
// draws its own header lockup, its idle Close/Start bar, or its Stop bar — the
// host calls start()/stop() through the ref below instead.
//
// What deliberately STAYED is the reviewable bar: once there's a transcript,
// Discard-vs-Save is a real decision with consequences, and a one-row composer
// is no place for it. Dropping it too would leave every finished recording
// with no way to keep it.
export type RecordingSessionState = "idle" | "recording" | "reviewable";

/** Imperative start/stop, for a host that renders its own record controls
 *  (chat.tsx's composer). Commands come DOWN this ref; the resulting state
 *  goes back UP through onRecordingStateChange — this component stays the one
 *  owner of the transcription hook either way. */
export interface RecordSessionHandle {
  start: () => void;
  stop: () => void;
}

export interface RecordSessionProps {
  userId: string | null;
  threadId: string | null;
  /** Fires once, after Save lands or after a confirmed Discard — the host's cue
   *  to leave record mode (chat.tsx flips composerMode back to "chat"). */
  onDone: () => void;
  /** Fires whenever the three-state UI transitions — lets a host (chat.tsx)
   *  lock its own mode-switch control while a recording is live or has an
   *  unsaved transcript, without duplicating this component's state. */
  onRecordingStateChange?: (state: RecordingSessionState) => void;
}

export const RecordSession = forwardRef<RecordSessionHandle, RecordSessionProps>(function RecordSession(
  { userId, threadId, onDone, onRecordingStateChange },
  ref,
) {
  // A lecture is longer than the auto-lock timeout; keep the screen on while
  // this is mounted, since backgrounding would stop recognition.
  useKeepAwake();
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);

  const live = useLiveTranscription();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const recording = live.status === "recording";
  const reviewable = live.status === "stopped" && hasTranscript(live.transcript);

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

  // The host's record button (chat.tsx's composer) reaches start/stop through
  // here.
  useImperativeHandle(ref, () => ({ start: () => void live.start(), stop: live.stop }), [live]);

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
        // No notes at save time: the enhance pass below writes them once, from
        // whichever transcript it ends up with.
        buildRecordingDraft(live.transcript, live.elapsedSeconds, new Date(), ""),
      );
      // Enhance pass runs detached: the saved on-device transcript is already
      // safe, and the sharper server transcript swaps in when it lands.
      void enhanceRecordingArtifact(userId, threadId, entry, live.audioUris, live.elapsedSeconds);
      onDone();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Couldn't save the recording — check your connection and try again.");
      setSaving(false);
    }
  }, [userId, threadId, saving, live.transcript, live.elapsedSeconds, live.audioUris, onDone]);

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
              ? "Saving keeps this transcript, then sharpens it and writes your notes — both land in the chat moments later."
              : "Transcribes on this phone as you record, then saves the transcript into this chat.";

  return (
    <View style={styles.session}>
      {/* Clock only (owner 2026-07-22: "remove the 'record' and the microphone
          icon in the upper left"). The composer's record button already says
          what mode this is and whether it's running, so the title lockup was
          repeating it; the elapsed time is the one thing nothing else shows,
          and since the view switch went it is the only thing in this row. */}
      <View style={styles.header}>
        <Text style={[styles.clock, recording && { color: c.accent }]}>{formatRecordingClock(live.elapsedSeconds)}</Text>
      </View>

      {/* The one box. Its Transcript/Notes switch is gone with the live notes
          it existed for — see this file's header. */}
      <ScrollView
        contentContainerStyle={styles.transcriptContent}
        onContentSizeChange={() => {
          if (recording) scrollRef.current?.scrollToEnd({ animated: true });
        }}
        ref={scrollRef}
        style={styles.transcript}
        testID="record-transcript-view"
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

      <Text style={styles.statusLine}>{statusLine}</Text>
      {saveError ? <Text style={styles.errorLine}>{saveError}</Text> : null}

      {/* ONE bar left, and only once there's something to decide about. Start,
          Stop, Close and the "Recording" hint all moved to the composer
          (see this file's header note); Discard-vs-Save stays because losing
          it would mean a finished transcript with nowhere to go. */}
      {reviewable ? (
        <GlassSurface fallbackColor={c.glassPanel} style={styles.controls} shadow>
          <View style={styles.controlRow}>
            <MissionButton label="Discard" onPress={discard} testID="record-discard" variant="secondary" />
            <View style={styles.controlSpacer} />
            <MissionButton busy={saving} label={saving ? "Saving…" : "Save to chat"} onPress={() => void save()} testID="record-save" variant="primary" />
          </View>
        </GlassSurface>
      ) : null}
    </View>
  );
});

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // No backgroundColor/top-bottom inset padding here — that's "screen chrome"
    // and differs per host (full-screen modal vs. inline chat panel); see both
    // call sites (app/record.tsx, app/(tabs)/chat.tsx).
    session: { flex: 1, backgroundColor: c.bg, paddingHorizontal: space(4), paddingTop: space(3) },
    header: { flexDirection: "row", alignItems: "center", paddingBottom: space(3) },
    clock: { ...type.small, fontWeight: "600", fontVariant: ["tabular-nums"], color: c.text2 },
    transcript: { flex: 1, borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
    transcriptContent: { padding: space(4), gap: space(3), flexGrow: 1 },
    paragraph: { ...type.body, color: c.text },
    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space(6) },
    emptyText: { ...type.small, color: c.text3, textAlign: "center" },
    statusLine: { ...type.micro, color: c.text3, paddingVertical: space(3), textAlign: "center" },
    errorLine: { ...type.micro, color: c.accent, paddingBottom: space(2), textAlign: "center" },
    controls: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden", padding: space(3) },
    controlRow: { flexDirection: "row", alignItems: "center", gap: space(3) },
    controlSpacer: { flex: 1 },
  });
