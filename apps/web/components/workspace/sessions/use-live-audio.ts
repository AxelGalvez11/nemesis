"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  assemblyTurnToSegment,
  formatLiveDuration,
  mergeLiveAudioInsights,
  sanitizeLiveAudioKeyterms,
  transcriptText,
  upsertTranscriptSegment,
  type AssemblyTurnMessage,
  type LiveAudioInsights,
  type LiveAudioTokenResponse,
  type LiveTranscriptSegment,
} from "@/lib/workspace/live-audio-contract";
import { requestLiveAudioInsights } from "@/lib/workspace/live-audio-insights";

const EMPTY_INSIGHTS: LiveAudioInsights = { explore: [], notes: [], suggestions: [] };
const INSIGHT_MIN_CHARS = 160;
const INSIGHT_INTERVAL_MS = 45_000;

export type LiveAudioStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "stopping"
  | "quota"
  | "error";

interface UseLiveAudioOptions {
  active: boolean;
  accessToken: string | null;
  uid: string | null;
  surface: "sessions" | "notebook";
  context?: string;
  contextId?: string | null;
  keyterms?: string[];
}

interface AudioNodes {
  context: AudioContext;
  gain: GainNode;
  processor: ScriptProcessorNode;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
}

function floatToPcm16(buffer: Float32Array, sourceRate: number, targetRate = 16_000): ArrayBuffer {
  const ratio = Math.max(sourceRate / targetRate, 1);
  const outputLength = Math.max(1, Math.round(buffer.length / ratio));
  const pcm = new Int16Array(outputLength);
  let sourceOffset = 0;

  for (let outputOffset = 0; outputOffset < outputLength; outputOffset += 1) {
    const nextSourceOffset = Math.min(buffer.length, Math.round((outputOffset + 1) * ratio));
    let total = 0;
    let count = 0;
    for (let index = sourceOffset; index < nextSourceOffset; index += 1) {
      total += buffer[index] ?? 0;
      count += 1;
    }
    const sample = Math.max(-1, Math.min(1, count ? total / count : 0));
    pcm[outputOffset] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    sourceOffset = nextSourceOffset;
  }
  return pcm.buffer;
}

function audioLevel(buffer: Float32Array): number {
  if (!buffer.length) return 0;
  let squares = 0;
  for (const sample of buffer) squares += sample * sample;
  return Math.min(1, Math.sqrt(squares / buffer.length) * 4);
}

async function requestStreamingWindow(input: {
  accessToken: string;
  contextId?: string | null;
  surface: "sessions" | "notebook";
}): Promise<LiveAudioTokenResponse> {
  const response = await fetch("/api/live-audio/token", {
    body: JSON.stringify({ contextId: input.contextId ?? null, surface: input.surface }),
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = await response.json().catch(() => null) as (LiveAudioTokenResponse & { error?: string }) | null;
  if (!response.ok || !body?.token) {
    const error = new Error(body?.error || `Live transcription could not start (${response.status}).`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body;
}

export function useLiveAudioSession(options: UseLiveAudioOptions) {
  const [status, setStatus] = useState<LiveAudioStatus>("idle");
  const [segments, setSegments] = useState<LiveTranscriptSegment[]>([]);
  const [insights, setInsights] = useState<LiveAudioInsights>(EMPTY_INSIGHTS);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [usage, setUsage] = useState<LiveAudioTokenResponse["usage"] | null>(null);

  const mountedRef = useRef(true);
  const recordingRef = useRef(false);
  const nodesRef = useRef<AudioNodes | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const segmentsRef = useRef<LiveTranscriptSegment[]>([]);
  const insightsRef = useRef<LiveAudioInsights>(EMPTY_INSIGHTS);
  const reconnectTimerRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const lastLevelAtRef = useRef(0);
  const lastInsightAtRef = useRef(0);
  const insightBusyRef = useRef(false);
  const insightAbortRef = useRef<AbortController | null>(null);
  const connectWindowRef = useRef<() => Promise<void>>(async () => undefined);

  const cleanKeyterms = sanitizeLiveAudioKeyterms(options.keyterms ?? []);
  const cleanKeytermsKey = cleanKeyterms.join("\u0000");

  const releaseMedia = useCallback((updateState = true) => {
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    if (elapsedTimerRef.current !== null) window.clearInterval(elapsedTimerRef.current);
    reconnectTimerRef.current = null;
    elapsedTimerRef.current = null;
    insightAbortRef.current?.abort();
    insightAbortRef.current = null;
    insightBusyRef.current = false;

    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "Nemesis recording stopped");

    const nodes = nodesRef.current;
    nodesRef.current = null;
    if (nodes) {
      nodes.processor.onaudioprocess = null;
      nodes.processor.disconnect();
      nodes.source.disconnect();
      nodes.gain.disconnect();
      for (const track of nodes.stream.getTracks()) track.stop();
      void nodes.context.close().catch(() => undefined);
    }
    if (updateState && mountedRef.current) {
      setLevel(0);
      setStatus("idle");
    }
  }, []);

  const requestInsights = useCallback((nextSegments: LiveTranscriptSegment[]) => {
    if (!options.uid || insightBusyRef.current) return;
    const finalTranscript = transcriptText(nextSegments, true);
    if (finalTranscript.length < INSIGHT_MIN_CHARS) return;
    const now = Date.now();
    if (lastInsightAtRef.current && now - lastInsightAtRef.current < INSIGHT_INTERVAL_MS) return;

    lastInsightAtRef.current = now;
    insightBusyRef.current = true;
    const controller = new AbortController();
    insightAbortRef.current = controller;
    void requestLiveAudioInsights({
      context: options.context,
      previousNotes: insightsRef.current.notes,
      signal: controller.signal,
      transcript: finalTranscript,
      uid: options.uid,
    }).then((next) => {
      if (!next || !mountedRef.current) return;
      const merged = mergeLiveAudioInsights(insightsRef.current, next);
      insightsRef.current = merged;
      setInsights(merged);
    }).finally(() => {
      insightBusyRef.current = false;
      insightAbortRef.current = null;
    });
  }, [options.context, options.uid]);

  const connectWindow = useCallback(async () => {
    if (!recordingRef.current || !options.accessToken) return;
    setStatus("connecting");
    try {
      const windowToken = await requestStreamingWindow({
        accessToken: options.accessToken,
        contextId: options.contextId,
        surface: options.surface,
      });
      if (!recordingRef.current) return;
      setUsage(windowToken.usage);

      const params = new URLSearchParams({
        format_turns: "true",
        sample_rate: "16000",
        speech_model: windowToken.speechModel,
        token: windowToken.token,
        webhook_auth_header_name: windowToken.webhook.headerName,
        webhook_auth_header_value: windowToken.webhook.headerValue,
        webhook_url: windowToken.webhook.url,
      });
      if (cleanKeyterms.length) params.set("keyterms_prompt", JSON.stringify(cleanKeyterms));
      const socket = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?${params.toString()}`);
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;

      socket.onopen = () => {
        if (mountedRef.current && recordingRef.current) {
          setError(null);
          setStatus("listening");
        }
      };
      socket.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(event.data) as Record<string, unknown>;
        } catch {
          return;
        }
        if (message.type !== "Turn") return;
        const segment = assemblyTurnToSegment(message as unknown as AssemblyTurnMessage);
        if (!segment) return;
        const next = upsertTranscriptSegment(segmentsRef.current, segment);
        segmentsRef.current = next;
        if (mountedRef.current) setSegments(next);
        if (segment.final) requestInsights(next);
      };
      socket.onerror = () => {
        if (mountedRef.current && recordingRef.current) setError("The live transcript connection was interrupted. Reconnecting…");
      };
      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (!recordingRef.current || !mountedRef.current) return;
        setStatus("connecting");
        reconnectTimerRef.current = window.setTimeout(() => {
          void connectWindowRef.current();
        }, 350);
      };
    } catch (caught) {
      const failure = caught as Error & { status?: number };
      recordingRef.current = false;
      if (mountedRef.current) {
        setStatus(failure.status === 429 ? "quota" : "error");
        setError(failure.message);
      }
      releaseMedia(false);
    }
  }, [cleanKeytermsKey, options.accessToken, options.contextId, options.surface, releaseMedia, requestInsights]);

  connectWindowRef.current = connectWindow;

  const start = useCallback(async () => {
    if (recordingRef.current) return;
    if (!options.accessToken || !options.uid) {
      setStatus("error");
      setError("Sign in to start live transcription.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError("This browser does not support microphone capture.");
      return;
    }

    setError(null);
    setSegments([]);
    setInsights(EMPTY_INSIGHTS);
    setElapsedSeconds(0);
    segmentsRef.current = [];
    insightsRef.current = EMPTY_INSIGHTS;
    lastInsightAtRef.current = 0;
    recordingRef.current = true;
    setStatus("connecting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      if (!recordingRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      const context = new AudioContext({ latencyHint: "interactive", sampleRate: 16_000 });
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4_096, 1, 1);
      const gain = context.createGain();
      gain.gain.value = 0;
      source.connect(processor);
      processor.connect(gain);
      gain.connect(context.destination);
      nodesRef.current = { context, gain, processor, source, stream };

      processor.onaudioprocess = (event) => {
        const samples = event.inputBuffer.getChannelData(0);
        const socket = socketRef.current;
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(floatToPcm16(samples, context.sampleRate));
        }
        const now = performance.now();
        if (now - lastLevelAtRef.current > 90 && mountedRef.current) {
          lastLevelAtRef.current = now;
          setLevel(audioLevel(samples));
        }
      };

      startedAtRef.current = Date.now();
      elapsedTimerRef.current = window.setInterval(() => {
        if (mountedRef.current) setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1_000));
      }, 1_000);
      await connectWindowRef.current();
    } catch (caught) {
      recordingRef.current = false;
      const message = caught instanceof DOMException && caught.name === "NotAllowedError"
        ? "Microphone access was denied. Allow it in browser settings and try again."
        : "Nemesis could not open the microphone.";
      setStatus("error");
      setError(message);
      releaseMedia(false);
    }
  }, [options.accessToken, options.uid, releaseMedia]);

  const stop = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setStatus("stopping");
    insightAbortRef.current?.abort();
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "Terminate" }));
    window.setTimeout(() => releaseMedia(), 450);
  }, [releaseMedia]);

  useEffect(() => {
    if (options.active) void start();
    else stop();
  }, [options.active, start, stop]);

  useEffect(() => () => {
    mountedRef.current = false;
    recordingRef.current = false;
    releaseMedia(false);
  }, [releaseMedia]);

  return {
    elapsedLabel: formatLiveDuration(elapsedSeconds),
    elapsedSeconds,
    error,
    insights,
    level,
    segments,
    status,
    stop,
    transcript: transcriptText(segments),
    usage,
  };
}
