/**
 * Minimal Sentry sender for Supabase Edge Functions (Deno runtime).
 *
 * Uses the Sentry ingest envelope protocol directly instead of pulling
 * in @sentry/deno (keeps cold-start times low). Captures the error,
 * tags (function name + user id), and a truncated stack.
 *
 * Env:
 *   SENTRY_DSN        — server-side DSN (keep in edge secrets, not public)
 *   SENTRY_ENV        — e.g. "production" / "preview"
 *   SENTRY_RELEASE    — git sha, optional
 */

const DSN = Deno.env.get("SENTRY_DSN") ?? "";
const ENV = Deno.env.get("SENTRY_ENV") ?? "development";
const RELEASE = Deno.env.get("SENTRY_RELEASE");

interface ParsedDsn {
  host: string;
  projectId: string;
  publicKey: string;
  protocol: string;
}

let parsedDsn: ParsedDsn | null = null;
try {
  if (DSN) {
    const url = new URL(DSN);
    const projectId = url.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
    parsedDsn = {
      protocol: url.protocol.replace(":", ""),
      host: url.host,
      projectId,
      publicKey: url.username,
    };
  }
} catch {
  parsedDsn = null;
}

export interface SentryContext {
  functionName: string;
  userId?: string | null;
  extra?: Record<string, unknown>;
}

/**
 * Best-effort: send an exception event to Sentry. Never throws — failing
 * to log must not break the request being handled.
 */
export async function captureEdgeException(
  err: unknown,
  ctx: SentryContext,
): Promise<void> {
  if (!parsedDsn) return;

  try {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorType = err instanceof Error ? err.name : "Error";
    const stack = err instanceof Error ? err.stack : undefined;

    const event = {
      event_id: crypto.randomUUID().replace(/-/g, ""),
      timestamp: Date.now() / 1000,
      platform: "javascript",
      environment: ENV,
      release: RELEASE,
      server_name: `edge/${ctx.functionName}`,
      tags: { function: ctx.functionName },
      user: ctx.userId ? { id: ctx.userId } : undefined,
      extra: ctx.extra,
      exception: {
        values: [
          {
            type: errorType,
            value: errorMessage,
            stacktrace: stack ? parseStack(stack) : undefined,
          },
        ],
      },
    };

    const envelopeUrl =
      `${parsedDsn.protocol}://${parsedDsn.host}/api/` +
      `${parsedDsn.projectId}/envelope/?sentry_key=${parsedDsn.publicKey}&sentry_version=7`;

    const envelopeHeader = JSON.stringify({
      event_id: event.event_id,
      sent_at: new Date().toISOString(),
    });
    const itemHeader = JSON.stringify({
      type: "event",
      content_type: "application/json",
    });
    const body = `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(event)}`;

    await fetch(envelopeUrl, {
      method: "POST",
      headers: { "content-type": "application/x-sentry-envelope" },
      body,
    });
  } catch {
    // swallow — never let logging break a response
  }
}

function parseStack(stack: string) {
  const frames = stack
    .split("\n")
    .slice(1, 30)
    .map((line) => {
      const match = line.match(/at (?:(.+?) )?\(?(.+?):(\d+):(\d+)\)?/);
      if (!match) return { function: line.trim() };
      return {
        function: match[1] ?? "<anonymous>",
        filename: match[2],
        lineno: Number(match[3]),
        colno: Number(match[4]),
        in_app: !match[2]?.includes("node_modules"),
      };
    })
    .reverse();
  return { frames };
}
