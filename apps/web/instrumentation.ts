import type { Instrumentation } from "next";
import { phServerCapture } from "@/lib/posthog-server";

// Next.js calls this for every uncaught error in a route handler, server component, server
// action or proxy. Before 2026-09-05 those errors were only visible as a bare stack in the
// Vercel function log, with no path, no method and no user. This writes one JSON line per
// error and sends a matching PostHog event, so "who hit what, where" is one search away.
//
// The user id is read from the bearer token WITHOUT verifying it. That is fine for a log
// line and nothing else: never reuse this for access control.

function userIdFrom(headers: NodeJS.Dict<string | string[]>): string | undefined {
  try {
    const raw = headers.authorization ?? headers.Authorization;
    const header = Array.isArray(raw) ? raw[0] : raw;
    const token = (header ?? "").replace(/^Bearer\s+/i, "");
    const middle = token.split(".")[1];
    if (!middle) return undefined;
    const payload = JSON.parse(Buffer.from(middle, "base64url").toString("utf8")) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  try {
    const err = error as { message?: unknown; digest?: unknown; stack?: unknown } | null;
    const message = err && typeof err.message === "string" ? err.message : String(error);
    const digest = err && typeof err.digest === "string" ? err.digest : undefined;
    const stack = err && typeof err.stack === "string" ? err.stack.slice(0, 800) : undefined;
    const userId = userIdFrom(request.headers);

    console.error(JSON.stringify({
      event: "server_request_error",
      message,
      digest,
      stack,
      path: request.path,
      method: request.method,
      router: context.routerKind,
      route_type: context.routeType,
      route_path: context.routePath,
      user_id: userId,
    }));

    await phServerCapture(userId ?? "server", "server_error", {
      path: request.path,
      method: request.method,
      message,
      digest,
    });
  } catch {
    /* this hook must never throw */
  }
};
