import { useCallback, useEffect, useRef, useState } from 'react';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { normalizeMicLevel, publishMicLevel, resetMicLevel } from '@/lib/mic-level';

// The page recorder's microphone. Same capture as useLiveTranscription (on-device recognizer with persisted 16 kHz
// PCM), because that is the only microphone this build has. Differences: it can pause (a pause ends the session and a
// resume starts a new one, so the take is several files), the clock only counts time the microphone was on, and the
// recognizer's words are ignored: nothing is transcribed on screen, the server writes the notes.

const OPTIONS = {
  lang: 'en-US',
  interimResults: false,
  requiresOnDeviceRecognition: true,
  continuous: true,
  recordingOptions: { persist: true, outputEncoding: 'pcmFormatInt16', outputSampleRate: 16_000 },
  volumeChangeEventOptions: { enabled: true, intervalMillis: 80 },
} as const;

const FATAL = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported']);
const KEEP_AWAKE_TAG = 'nemesis-page-recorder';

export type RecorderState = 'idle' | 'recording' | 'paused' | 'stopped' | 'denied' | 'error';

export function useRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const stateRef = useRef<RecorderState>('idle');
  const uris = useRef<string[]>([]);
  const banked = useRef(0);
  const since = useRef<number | null>(null);
  const ended = useRef<(() => void) | null>(null);
  const startedAt = useRef<number | null>(null);

  const set = (s: RecorderState) => {
    stateRef.current = s;
    setState(s);
  };
  const liveSeconds = () => Math.floor((banked.current + (since.current ? Date.now() - since.current : 0)) / 1000);

  useSpeechRecognitionEvent('volumechange', (e) => {
    if (stateRef.current === 'recording') publishMicLevel(normalizeMicLevel(typeof e.value === 'number' ? e.value : 0));
  });
  useSpeechRecognitionEvent('audioend', (e) => {
    if (typeof e.uri === 'string' && !uris.current.includes(e.uri)) uris.current.push(e.uri);
  });
  useSpeechRecognitionEvent('end', () => {
    if (stateRef.current === 'recording') {
      // iOS ended the task on its own (a long silence, a timeout): keep going.
      try {
        ExpoSpeechRecognitionModule.start(OPTIONS);
      } catch {
        set('error');
      }
      return;
    }
    ended.current?.();
    ended.current = null;
  });
  useSpeechRecognitionEvent('error', (e) => {
    if (stateRef.current !== 'recording') return;
    const code = typeof e.error === 'string' ? e.error : '';
    if (FATAL.has(code)) set(code === 'not-allowed' || code === 'service-not-allowed' ? 'denied' : 'error');
  });

  useEffect(() => {
    if (state !== 'recording') return;
    const t = setInterval(() => setSeconds(liveSeconds()), 500);
    return () => clearInterval(t);
  }, [state]);

  /**
   * Asks once; when the answer was already no, reports denied without a prompt iOS would not show anyway.
   * 🔴 Capture runs on-device only (privacy), so a phone without Apple's on-device speech model (the Simulator, some
   * older or region-locked phones) never starts the audio engine. That is reported as 'unsupported', not as a broken
   * microphone or a permission problem.
   */
  const start = useCallback(async (): Promise<'ok' | 'denied' | 'unsupported' | 'error'> => {
    try {
      const current = await ExpoSpeechRecognitionModule.getPermissionsAsync();
      const perm = current.granted || !current.canAskAgain ? current : await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        set('denied');
        return 'denied';
      }
      if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
        set('error');
        return 'unsupported';
      }
      uris.current = [];
      banked.current = 0;
      since.current = Date.now();
      startedAt.current = Date.now();
      setSeconds(0);
      ExpoSpeechRecognitionModule.start(OPTIONS);
      set('recording');
      void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
      return 'ok';
    } catch {
      set('error');
      return 'error';
    }
  }, []);

  const halt = (next: RecorderState) =>
    new Promise<void>((resolve) => {
      if (since.current) banked.current += Date.now() - since.current;
      since.current = null;
      setSeconds(liveSeconds());
      set(next);
      resetMicLevel();
      const timer = setTimeout(() => resolve(), 2500);
      ended.current = () => {
        clearTimeout(timer);
        // The persisted file's `audioend` can land just after `end`.
        setTimeout(resolve, 150);
      };
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        resolve();
      }
    });

  const pause = useCallback(async () => {
    if (stateRef.current === 'recording') await halt('paused');
  }, []);

  const resume = useCallback(() => {
    if (stateRef.current !== 'paused') return;
    try {
      since.current = Date.now();
      ExpoSpeechRecognitionModule.start(OPTIONS);
      set('recording');
    } catch {
      set('error');
    }
  }, []);

  /** Closes the microphone and hands back every piece of the take. */
  const stop = useCallback(async (): Promise<{ uris: string[]; seconds: number; startedAt: number }> => {
    if (stateRef.current === 'recording') await halt('stopped');
    else set('stopped');
    deactivateKeepAwake(KEEP_AWAKE_TAG);
    return { uris: [...uris.current], seconds: Math.floor(banked.current / 1000), startedAt: startedAt.current ?? Date.now() };
  }, []);

  useEffect(
    () => () => {
      stateRef.current = 'idle';
      resetMicLevel();
      deactivateKeepAwake(KEEP_AWAKE_TAG);
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        // already stopped
      }
    },
    [],
  );

  return { state, seconds, startedAt: startedAt.current, start, pause, resume, stop };
}
