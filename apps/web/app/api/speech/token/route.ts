// A ten-minute Azure token, so the browser never holds the key.
//
// 🔴 THIS EXISTS FOR THE CASE WHERE THE BROWSER MUST TALK TO AZURE DIRECTLY, AND FOR NO OTHER.
// Everything Nemesis does today goes through the server: `/api/speech/tts` streams audio back and
// `/api/speech/pronunciation` posts a recording. The one thing that cannot work that way is Azure's
// browser SDK doing continuous, streaming recognition over a websocket — the audio has to reach
// Azure from the page. When that lands, this is what authorises it.
//
// 🔴 THE PERMANENT KEY IS NEVER RETURNED, AND THAT IS ENFORCED BY WHAT IS IN THE RESPONSE RATHER THAN
// BY CARE. The body carries a minted bearer token, its expiry and the region. There is no field a
// key could occupy. `AZURE_SPEECH_KEY` appears nowhere in this app's client bundle and must never be
// renamed to `NEXT_PUBLIC_*` — the config module throws in a browser to make that mistake loud.
//
// 🔴 SIGNED IN ONLY. A token endpoint anybody can call is a Speech resource anybody can spend.

import { azureSpeechConfig, AZURE_TOKEN_TTL_SECONDS } from "@/lib/speech/azure/config";
import { httpRefusal } from "@/lib/speech/azure/voice-catalog";
import { json, verifyBearer } from "@/lib/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await verifyBearer(request);
  if (!user) return json({ error: "Sign in to use speech." }, 401);

  const configured = azureSpeechConfig();
  if (!configured.ok) {
    return json({ error: "Azure Speech is not configured yet.", reason: configured.reason }, 503);
  }

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(configured.config.tokenEndpoint, {
      cache: "no-store",
      headers: {
        "Content-Length": "0",
        "Ocp-Apim-Subscription-Key": configured.config.key,
      },
      method: "POST",
    });
  } catch {
    return json({ error: "Speech is unavailable right now.", reason: "azure-unreachable" }, 502);
  }

  if (!response.ok) {
    // Never echo Azure's body: on a bad key it can contain the request headers it received.
    console.error(JSON.stringify({ event: "azure_token_failed", status: response.status }));
    return json({ error: "Speech is unavailable right now.", reason: httpRefusal(response.status) }, 502);
  }

  const token = (await response.text().catch(() => "")).trim();
  if (!token) {
    return json({ error: "Speech is unavailable right now.", reason: "azure-error" }, 502);
  }

  return new Response(
    JSON.stringify({
      // Nine minutes, not Azure's full ten: a client that refreshes on expiry needs slack for the
      // round trip, and a token that dies mid-utterance is a failure the learner sees.
      expiresInSeconds: AZURE_TOKEN_TTL_SECONDS,
      latencyMs: Date.now() - startedAt,
      region: configured.config.region,
      token,
    }),
    {
      headers: {
        // 🔴 A CREDENTIAL MUST NOT SIT IN A CACHE. Vercel, a CDN or a service worker holding this
        // would hand one learner's token to the next.
        "Cache-Control": "no-store, private",
        "Content-Type": "application/json",
      },
      status: 200,
    },
  );
}
