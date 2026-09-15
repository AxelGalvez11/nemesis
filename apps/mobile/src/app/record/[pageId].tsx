import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SkelPage } from '@/components/nx/Skeleton';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadPage, type LoadedPage } from '@/api/space';
import {
  createRecordingBlock,
  dropPendingAudio,
  finishRecording,
  prepareRecordingAudio,
  readJob,
  retryJob,
  setRecordingProps,
  stageLabel,
  submitPageRecording,
  type JobStage,
} from '@/api/recording';
import { NxIconButton } from '@/components/nx/primitives';
import { RecordPill } from '@/components/nx/record/RecordPill';
import { MicOffSheet, NotesFailedCard, PropRows, WritingNotesCard } from '@/components/nx/record/RecordStates';
import { useRecorder } from '@/components/nx/record/useRecorder';
import { iconOf } from '@/lib/fresh';
import { nxType, useNx } from '@/theme/nx';

// Recording a class onto a page. Open with router.push({ pathname: '/record/[pageId]', params: { pageId } }).
// It starts the microphone at once, shows the page with the recorder pill, and on End: saves what was typed and a
// recording block on the page, uploads, files the page job, waits while the notes are written, puts them on the page
// and in its Sources, then goes back. Leaving while the notes are being written is fine: settlePageRecordings(pageId)
// in api/recording.ts finishes the job the next time the page opens.

type Phase =
  | { kind: 'recording' }
  | { kind: 'saving'; step: JobStage | 'uploading' | null }
  | { kind: 'failed'; body: string; canKeepAudio: boolean }
  | { kind: 'micoff' };

const POLL_MS = 4000;

function timeLabel(at: number): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? `Today, ${time}` : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}

export default function RecordScreen() {
  const { pageId } = useLocalSearchParams<{ pageId: string }>();
  const c = useNx();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const rec = useRecorder();

  const [page, setPage] = useState<LoadedPage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'recording' });
  const [ending, setEnding] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const take = useRef<{ blockId: string | null; uris: string[]; seconds: number; startedAt: number; audio: { uri: string; bytes: number } | null; jobId: string | null; artifactId: string | null }>({
    blockId: null, uris: [], seconds: 0, startedAt: Date.now(), audio: null, jobId: null, artifactId: null,
  });
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  useEffect(() => {
    Keyboard.dismiss();
    if (!pageId) return;
    loadPage(pageId).then(setPage, (e: Error) => setLoadError(e.message));
    void rec.start().then((ok) => {
      if (!ok && alive.current) setPhase({ kind: 'micoff' });
    });
    // Start once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  useEffect(() => {
    if (rec.state === 'denied') setPhase({ kind: 'micoff' });
    else if (rec.state === 'error' && phase.kind === 'recording') setPhase({ kind: 'failed', body: 'The microphone stopped working. What was recorded so far is kept. Try again to save it.', canKeepAudio: false });
  }, [rec.state, phase.kind]);

  const refreshPage = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['ws-page', pageId] });
    await qc.invalidateQueries({ queryKey: ['ws-sources', pageId] });
  }, [qc, pageId]);

  /** Waits on the job and finishes it. Returns when it is ready (and the screen went back) or failed. */
  const follow = useCallback(async () => {
    const t = take.current;
    if (!t.jobId || !t.artifactId || !t.blockId) return;
    for (;;) {
      if (!alive.current) return;
      const job = await readJob(t.jobId).catch(() => null);
      if (job?.status === 'ready') {
        const fresh = await loadPage(pageId);
        const block = fresh.records.find((r) => r.id === t.blockId);
        if (block) await finishRecording(fresh, block, t.jobId, t.artifactId, t.audio?.bytes ?? null);
        await refreshPage();
        if (alive.current) router.back();
        return;
      }
      if (job?.status === 'failed') {
        const current = await loadPage(pageId).catch(() => null);
        if (current) await setRecordingProps(current.space_id, t.blockId, { status: 'failed' }).catch(() => undefined);
        setPhase({ kind: 'failed', body: 'The recording is saved, so nothing is lost. Try again, or keep the audio without notes.', canKeepAudio: true });
        return;
      }
      if (job) setPhase({ kind: 'saving', step: job.stage });
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }, [pageId, refreshPage, router]);

  /** Upload and file the job; the step that fails shows the failure card with the audio still on the phone. */
  const submit = useCallback(async () => {
    const t = take.current;
    if (!page || !t.blockId) return;
    setPhase({ kind: 'saving', step: 'uploading' });
    try {
      t.audio = t.audio ?? (await prepareRecordingAudio(t.blockId, t.uris));
      const job = await submitPageRecording({ pageId, blockId: t.blockId, audioUri: t.audio.uri, seconds: t.seconds });
      t.jobId = job.jobId;
      t.artifactId = job.artifactId;
      await setRecordingProps(page.space_id, t.blockId, { status: 'processing', jobId: job.jobId, artifactId: job.artifactId, storagePath: job.storagePath, durationSeconds: t.seconds, bytes: t.audio.bytes });
      setPhase({ kind: 'saving', step: 'queued' });
      void follow();
    } catch (e) {
      await setRecordingProps(page.space_id, t.blockId, { status: 'upload_failed', durationSeconds: t.seconds }).catch(() => undefined);
      const reason = e instanceof Error ? e.message : 'The recording could not be saved.';
      setPhase({ kind: 'failed', body: `${reason} The recording is saved on this phone, so nothing is lost.`, canKeepAudio: false });
    }
  }, [page, pageId, follow]);

  const end = useCallback(async () => {
    if (ending || !page) return;
    setEnding(true);
    Keyboard.dismiss();
    const done = await rec.stop();
    Object.assign(take.current, { uris: done.uris, seconds: Math.max(1, done.seconds), startedAt: done.startedAt });
    if (!done.uris.length) {
      setEnding(false);
      setPhase({ kind: 'failed', body: 'Nothing was recorded. Check that the microphone is working, then try again.', canKeepAudio: false });
      return;
    }
    try {
      const lines = typed.split('\n').map((l) => l.trim()).filter(Boolean);
      take.current.blockId = await createRecordingBlock(page, done.startedAt, lines);
    } catch (e) {
      setEnding(false);
      setPhase({ kind: 'failed', body: `${e instanceof Error ? e.message : 'The page could not be saved.'} The recording is kept until you try again.`, canKeepAudio: false });
      return;
    }
    setEnding(false);
    await submit();
  }, [ending, page, rec, typed, submit]);

  const retry = useCallback(async () => {
    setRetrying(true);
    const t = take.current;
    try {
      if (t.jobId) {
        await retryJob(t.jobId);
        if (page && t.blockId) await setRecordingProps(page.space_id, t.blockId, { status: 'processing' }).catch(() => undefined);
        setPhase({ kind: 'saving', step: null });
        void follow();
      } else if (!t.blockId && page && t.uris.length) {
        const lines = typed.split('\n').map((l) => l.trim()).filter(Boolean);
        t.blockId = await createRecordingBlock(page, t.startedAt, lines);
        await submit();
      } else if (t.blockId) {
        await submit();
      } else {
        router.back();
      }
    } catch (e) {
      setPhase({ kind: 'failed', body: e instanceof Error ? e.message : 'That did not work. Try again in a moment.', canKeepAudio: !!t.jobId });
    } finally {
      setRetrying(false);
    }
  }, [page, typed, follow, submit, router]);

  /** Job failed after upload: the page keeps the recording as a source without notes. */
  const keepAudio = useCallback(async () => {
    const t = take.current;
    if (page && t.blockId) {
      await setRecordingProps(page.space_id, t.blockId, { status: 'audio_only' }).catch(() => undefined);
      await dropPendingAudio(t.blockId);
    }
    await refreshPage();
    router.back();
  }, [page, refreshPage, router]);

  const parent = page?.ancestors[page.ancestors.length - 1];
  const title = String(page?.page.props.title ?? '') || 'Untitled recording';
  const recordingValue =
    phase.kind === 'recording' ? (rec.state === 'paused' ? 'Paused' : 'In progress') : `${Math.max(1, Math.round(take.current.seconds / 60))} min`;
  const showPill = phase.kind === 'recording' && (rec.state === 'recording' || rec.state === 'paused');

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false, animation: 'fade', gestureEnabled: phase.kind !== 'recording' }} />
      <View style={[styles.header, { paddingTop: insets.top + 2 }]}>
        <NxIconButton
          icon="chev_l"
          size={22}
          label="Back"
          color={c.t1}
          onPress={() => (phase.kind === 'recording' && showPill ? void end() : router.back())}
        />
        <View style={styles.crumbWrap}>
          {parent ? (
            <View style={styles.crumb}>
              <Text style={{ fontSize: 14 }}>{iconOf(parent.props.icon)}</Text>
              <Text numberOfLines={1} style={{ fontSize: 14, color: c.t2, maxWidth: 200 }}>
                {parent.props.title || 'Untitled'}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {loadError ? (
          <Text style={[styles.note, { color: c.t2 }]}>{loadError}</Text>
        ) : !page ? (
          <SkelPage />
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 160 }}>
            <Text style={[nxType.pageEmoji, { paddingHorizontal: 20, paddingTop: 14 }]}>{iconOf(page.page.props.icon, '🎙️')}</Text>
            <Text style={[nxType.pageTitle, { color: c.t1, paddingHorizontal: 20, paddingTop: 6 }]}>{title}</Text>
            {phase.kind !== 'micoff' ? (
              <PropRows
                rows={[
                  { icon: 'calendar', label: 'Date', value: timeLabel(rec.startedAt ?? take.current.startedAt) },
                  { icon: 'mic', label: 'Recording', value: recordingValue },
                ]}
              />
            ) : null}

            {phase.kind === 'saving' ? <WritingNotesCard step={stageLabel(phase.step)} /> : null}
            {phase.kind === 'failed' ? (
              <NotesFailedCard
                body={phase.body}
                onRetry={() => void retry()}
                retrying={retrying}
                secondLabel={phase.canKeepAudio ? 'Keep audio only' : 'Not now'}
                onSecond={() => (phase.canKeepAudio ? void keepAudio() : router.back())}
              />
            ) : null}

            {phase.kind === 'recording' ? (
              <TextInput
                value={typed}
                onChangeText={setTyped}
                multiline
                scrollEnabled={false}
                accessibilityLabel="Your notes"
                style={[nxType.body, styles.typed, { color: c.t2 }]}
              />
            ) : typed.trim() && phase.kind !== 'micoff' ? (
              <>
                <Text style={[nxType.section, { color: c.t2, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 }]}>What you typed</Text>
                <View style={{ paddingHorizontal: 20, gap: 6 }}>
                  {typed
                    .split('\n')
                    .filter((l) => l.trim())
                    .map((l, i) => (
                      <Text key={i} style={[nxType.body, { color: c.t2 }]}>
                        {l}
                      </Text>
                    ))}
                </View>
              </>
            ) : null}
          </ScrollView>
        )}

        {showPill ? (
          <View pointerEvents="box-none" style={[styles.pillDock, { paddingBottom: Math.max(insets.bottom, 34) }]}>
            <RecordPill
              seconds={rec.seconds}
              paused={rec.state === 'paused'}
              busy={ending || !page}
              onPause={() => void rec.pause()}
              onResume={rec.resume}
              onEnd={() => void end()}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <MicOffSheet
        visible={phase.kind === 'micoff'}
        onOpenSettings={() => {
          void Linking.openSettings();
          router.back();
        }}
        onNotNow={() => router.back()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 2 },
  crumbWrap: { flex: 1, alignItems: 'center' },
  crumb: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 10 },
  note: { paddingHorizontal: 20, paddingTop: 16, fontSize: 15, lineHeight: 22 },
  typed: { paddingHorizontal: 20, paddingTop: 16, minHeight: 200, textAlignVertical: 'top' },
  pillDock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
