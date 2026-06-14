import { PostHog } from "posthog-node";
import { posthogHost, posthogKey } from "./env";

// Server-side PostHog for backend-truth events (subscription lifecycle from Stripe webhooks).
// Uses the same public project key — write-only, safe on the server too. flushAt:1 + an awaited
// flush because serverless handlers terminate right after the response; without it the event can
// be dropped. Never throws: analytics must not break a webhook.
let client: PostHog | null = null;

function ph(): PostHog | null {
  if (!posthogKey) return null;
  if (!client) client = new PostHog(posthogKey, { host: posthogHost, flushAt: 1, flushInterval: 0 });
  return client;
}

export async function phServerCapture(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  const c = ph();
  if (!c || !distinctId) return;
  try {
    c.capture({ distinctId, event, properties });
    await c.flush();
  } catch {
    /* swallow — a webhook must never fail because analytics did */
  }
}
