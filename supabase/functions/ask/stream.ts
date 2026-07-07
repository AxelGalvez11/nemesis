// SSE transport for the /ask streaming mode (ASK_STREAMING=on + body.stream===true, DEFAULT OFF).
//
// The stream carries three event kinds while the SAME runAsk pipeline executes unchanged:
//   stage    — real pipeline milestones ({stage:"understanding"|"searching"|"sources"|"writing"})
//   delta    — safety-gated lead-paragraph text as the model writes it ({text})
//   complete — the canonical AskResponse, byte-identical to the non-streaming JSON body. TERMINAL
//              and AUTHORITATIVE: the client must replace anything it streamed with this (safety
//              fallback, citation enforcement, and the typo-assumption prefix can all revise the
//              lead after generation).
//   error    — {error, ...} mirroring the non-streaming error bodies (incl. quota_exceeded).
//
// Delta text passes the SafeTextEmitter gate (stream-gate.ts) against detectViolations — the
// same scan the non-streaming path runs — so the doc-20 "never displayed" guarantee holds for
// every streamed prefix. Flag off or stream not requested: this module is never invoked.

import type { AskResponse } from "../../../packages/shared/src/answer.ts";
import { detectViolations } from "./safety.ts";
import { SafeTextEmitter } from "./stream-gate.ts";

export function askStreamingEnabled(): boolean {
  return Deno.env.get("ASK_STREAMING") === "on";
}

export type AskEmit = (event: "stage" | "delta", data: Record<string, unknown>) => void;

/** The streamed-lead gate: same detectViolations teeth as the non-streaming scan. */
export function makeLeadGate(): SafeTextEmitter {
  return new SafeTextEmitter((text) => detectViolations(text).length === 0);
}

/**
 * Run the pipeline and relay its events as an SSE response. `mapError` converts a thrown error
 * into the same JSON body the non-streaming path would have returned (quota payloads included) —
 * SSE responses are committed at status 200, so errors travel as terminal `error` events instead
 * of status codes.
 */
export function sseAskResponse(
  run: (emit: AskEmit) => Promise<AskResponse>,
  baseHeaders: Record<string, string>,
  mapError: (e: unknown) => Record<string, unknown>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true; // client disconnected — let the pipeline finish (trace still stores)
        }
      };
      try {
        const resp = await run((event, data) => send(event, data));
        send("complete", resp);
      } catch (e) {
        send("error", mapError(e));
      } finally {
        try {
          controller.close();
        } catch {
          // already closed by a client disconnect
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      ...baseHeaders,
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "x-accel-buffering": "no",
    },
  });
}
