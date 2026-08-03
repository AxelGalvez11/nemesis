import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useKeepAwake } from "expo-keep-awake";
import { enhanceRecordingArtifact, recordingOutputForChat, saveRecordingArtifact } from "@/api/chat";
import { GlassSurface } from "@/components/GlassSurface";
import { MissionButton } from "@/components/mission-ui";
import { LiveWaveform } from "./LiveWaveform";
import { useMicHealth } from "@/hooks/useMicHealth";
import { micHealthMessage } from "@/lib/mic-health";
import { buildRecordingDraft, formatRecordingClock, hasTranscript } from "@/lib/recording";
import { useLiveTranscription } from "@/hooks/useLiveTranscription";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";
import type { ChatOutput } from "@/lib/chat-thread";

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
  /** Posts the saved recording into the conversation before record mode exits. */
  onSaved?: (output: ChatOutput) => void;
  /** Posts the resolved notes artifact after the background polish pass. */
  onUpdated?: (output: ChatOutput) => void;
  /** Fires whenever the three-state UI transitions — lets a host (chat.tsx)
   *  lock its own mode-switch control while a recording is live or has an
   *  unsaved transcript, without duplicating this component's state. */
  onRecordingStateChange?: (state: RecordingSessionState) => void;
}

export const RecordSession = forwardRef<RecordSessionHandle, RecordSessionProps>(function RecordSession(
  { userId, threadId, onDone, onSaved, onUpdated, onRecordingStateChange },
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

  const recording = live.status === "recording";
  // 🔴 AUDIO, NOT TEXT, IS WHAT DECIDES THERE IS SOMETHING TO SAVE.
  //
  // This used to be `hasTranscript(live.transcript)` alone, and that quietly
  // destroyed recordings. The audio file comes from the engine's `audioend`
  // event and exists whether or not on-device recognition managed to make words
  // out of it — so a lecturer across a room, the case this app is FOR, produced
  // a real recording, no live text, and therefore no Save button at all. The
  // student's only remaining option was Discard.
  //
  // It is the same root cause as the xAI silence gate (owner 2026-07-29: "most
  // audio will be naturally quiet because lecturer is farther away than the
  // microphone") and it fails in the same direction: quiet audio treated as no
  // audio. Saving with an empty transcript is safe and is the whole point — the
  // enhance pass uploads from `audioUris`, which never consults the draft text,
  // and the server transcript replaces it minutes later. The chat card shows
  // "Polishing transcript…" in the meantime.
  const hasAudio = live.audioUris.length > 0;
  const reviewable = live.status === "stopped" && (hasTranscript(live.transcript) || hasAudio);
  // What the microphone is actually picking up, for the line under the waveform.
  const micHealth = useMicHealth(recording);

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
    if (recording || reviewable) {
      Alert.alert("Discard recording?", "This unsaved recording will be lost.", [
        { style: "cancel", text: "Keep recording" },
        { onPress: onDone, style: "destructive", text: "Discard" },
      ]);
      return;
    }
    onDone();
  }, [recording, reviewable, onDone]);

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
      onSaved?.(recordingOutputForChat(entry));
      // Enhance pass runs detached: the saved on-device transcript is already
      // safe, and the sharper server transcript swaps in when it lands.
      void enhanceRecordingArtifact(userId, threadId, entry, live.audioUris, live.elapsedSeconds, onUpdated);
      onDone();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Couldn't save the recording — check your connection and try again.");
      setSaving(false);
    }
  }, [userId, threadId, saving, live.transcript, live.elapsedSeconds, live.audioUris, onDone, onSaved, onUpdated]);

  // The non-recording states. The recording one is gone from here on purpose:
  // while the mic is live this slot is driven by micHealthMessage instead, which
  // says the same "Listening" when all is well and something useful when it is
  // not. Keeping a static string here too would have meant two sources fighting
  // over one line.
  const statusLine =
    live.status === "denied"
      ? "Microphone or speech recognition is turned off for Nemesis. Enable both in iOS Settings, then try again."
      : live.status === "error"
        ? "Live transcription isn't available right now. Try again in a moment."
        : live.status === "stopped" && !reviewable
          // Reachable only with NO audio file either — with audio this is now a
          // saveable recording, so the old "nothing was transcribed" verdict
          // would have been both wrong and the reason the audio got thrown away.
          ? "Nothing was recorded. Start again and check the microphone isn't covered."
          : reviewable
            ? "Saving keeps this recording, then sharpens it and writes your notes — both land in the chat moments later."
            : "Records the room and saves it into this chat, with the transcript written afterwards.";

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

      {/* The transcript is deliberately never rendered on iOS. It remains
          private processing input for the notes, while the student sees the
          single large microphone waveform before and after stopping. */}
      <View style={styles.meter} testID="record-waveform-view">
        {/* Three states, and the middle one is the point (owner 2026-08-01:
            "grayed waveform thats active and dynamic, when user begins actually
            recording the waveform should switch to blue"). ARMED — ready, not
            capturing — moves in grey so the meter never looks broken while a
            student waits for the lecturer to start.

            REVIEWABLE IS "off", NOT "armed", and that is a deliberate reading of
            the brief rather than an oversight: once there is a transcript
            waiting for Save or Discard the mic is genuinely shut, and a strip
            still waving would say it is listening when it is not.

            The blue is c.info, a FIXED colour rather than the student's chosen
            accent. It has to be: the accent defaults to graphite, so on most
            phones "switches to accent" would have been no visible switch at
            all. This is the one place in the app that steps outside the accent
            system, and it does so because the whole ask is a colour CHANGE. */}
        <LiveWaveform
          state={recording ? "live" : reviewable ? "off" : "armed"}
          color={c.info}
          height={72}
          testID="record-waveform"
        />
        {!recording ? (
          <Text style={styles.meterLabel}>
            {reviewable
              ? `${formatRecordingClock(live.elapsedSeconds)} recorded · ready to save`
              : "Tap record when the lecture begins"}
          </Text>
        ) : null}
      </View>

      {/* While recording this is the mic-health line; otherwise the session's
          own state. Both land in the same slot so the layout never shifts. */}
      <Text style={styles.statusLine} testID="record-status-line">
        {recording ? micHealthMessage(micHealth) : statusLine}
      </Text>
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
    // Same box as the transcript it replaces — same flex, radius, border and
    // fill — so starting and stopping a recording swaps the CONTENTS of one
    // panel rather than resizing the screen around it. The waveform is centred
    // in it rather than stretched, because a strip pinned to the top of a tall
    // empty box reads as a loading bar.
    meter: {
      flex: 1,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: space(5),
    },
    meterLabel: { ...type.small, color: c.text3, marginTop: space(4), textAlign: "center" },
    statusLine: { ...type.micro, color: c.text3, paddingVertical: space(3), textAlign: "center" },
    errorLine: { ...type.micro, color: c.accent, paddingBottom: space(2), textAlign: "center" },
    controls: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden", padding: space(3) },
    controlRow: { flexDirection: "row", alignItems: "center", gap: space(3) },
    controlSpacer: { flex: 1 },
  });
