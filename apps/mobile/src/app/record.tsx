import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { saveRecordingArtifact } from "@/api/chat";
import { GlassSurface } from "@/components/GlassSurface";
import { MicIcon } from "@/components/icons";
import { MissionButton } from "@/components/mission-ui";
import { buildRecordingDraft, formatRecordingClock, hasTranscript } from "@/lib/recording";
import { useLiveTranscription } from "@/hooks/useLiveTranscription";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Record (phone half of web's Record mode): live on-device transcription of a
// lecture or study session, saved into the open chat as the same recording
// artifact web creates — so it shows up as a chip in this chat on every
// device. Speech never leaves the phone (SFSpeechRecognizer on-device, same
// engine as chat dictation) and no transcription minutes are billed.

export default function RecordScreen() {
  // A lecture is longer than the auto-lock timeout; keep the screen on while
  // this modal is up, since backgrounding would stop recognition.
  useKeepAwake();
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const params = useLocalSearchParams<{ c?: string }>();
  const threadId = (Array.isArray(params.c) ? params.c[0] : params.c) ?? null;

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

  const discard = useCallback(() => {
    if (recording || hasTranscript(live.transcript)) {
      Alert.alert("Discard recording?", "The transcript from this recording will be lost.", [
        { style: "cancel", text: "Keep recording" },
        { onPress: () => router.back(), style: "destructive", text: "Discard" },
      ]);
      return;
    }
    router.back();
  }, [recording, live.transcript]);

  const save = useCallback(async () => {
    if (!uid || !threadId || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveRecordingArtifact(uid, threadId, buildRecordingDraft(live.transcript, live.elapsedSeconds, new Date()));
      router.back();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Couldn't save the recording — check your connection and try again.");
      setSaving(false);
    }
  }, [uid, threadId, saving, live.transcript, live.elapsedSeconds]);

  const statusLine =
    live.status === "denied"
      ? "Microphone or speech recognition is turned off for Nemesis. Enable both in iOS Settings, then try again."
      : live.status === "error"
        ? "Live transcription isn't available right now. Try again in a moment."
        : live.status === "recording"
          ? "Listening — speech is transcribed on this phone and never uploaded as audio."
          : live.status === "stopped" && !reviewable
            ? "Nothing was transcribed. Start again and speak close to the phone."
            : "Transcribes on this phone as you record, then saves the transcript into this chat.";

  return (
    <View style={[styles.page, { paddingBottom: Math.max(insets.bottom, space(4)), paddingTop: space(4) }]}>
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

      <Text style={styles.statusLine}>{statusLine}</Text>
      {saveError ? <Text style={styles.errorLine}>{saveError}</Text> : null}

      <GlassSurface fallbackColor={c.glassPanel} style={styles.controls}>
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
              disabled={!uid || !threadId || live.status === "denied"}
              label="Start recording"
              onPress={() => void live.start()}
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
    page: { flex: 1, backgroundColor: c.bg, paddingHorizontal: space(4) },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: space(3) },
    headerLead: { flexDirection: "row", alignItems: "center", gap: space(2) },
    title: { ...type.title, color: c.text },
    clock: { fontSize: 16, fontVariant: ["tabular-nums"], color: c.text2, fontWeight: "600" },
    transcript: { flex: 1, borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
    transcriptContent: { padding: space(4), gap: space(3), flexGrow: 1 },
    paragraph: { ...type.body, color: c.text },
    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space(6) },
    emptyText: { ...type.body, color: c.text3, textAlign: "center", fontSize: 15, lineHeight: 22 },
    statusLine: { color: c.text3, fontSize: 12.5, lineHeight: 18, paddingVertical: space(3), textAlign: "center" },
    errorLine: { color: c.accent, fontSize: 12.5, lineHeight: 18, paddingBottom: space(2), textAlign: "center" },
    controls: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden", padding: space(3) },
    controlRow: { flexDirection: "row", alignItems: "center", gap: space(3) },
    controlSpacer: { flex: 1 },
    liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent },
    controlHint: { ...type.body, color: c.text2, fontSize: 15 },
  });
