/**
 * The one answer to "may Nemesis Lab run here?", read by every Lab surface and every Lab route.
 *
 * 🔴 ONE HELPER, TWO CALLERS, BECAUSE TWO GATES DRIFT. The obvious shape is a `notFound()` in the
 * Lab's layout — which hides the pages and leaves every `/api/dev/lab/*` route answering in
 * production, where they parse attacker-supplied bytes, mint learners and write rows. The layout
 * gate and the route gate must be the SAME predicate, so there is one thing to get right and one
 * thing to test.
 *
 * 🔴 `NODE_ENV`, NOT A `NEXT_PUBLIC_*` FLAG. Next inlines public env at BUILD time, so a flag would
 * make "is the Lab off" a property of whichever build is deployed rather than of where the code is
 * running — and a preview build carrying the wrong value would ship the Lab to the world. `NODE_ENV`
 * is set to `production` by `next build`/`next start` and by Vercel, and to `development` by
 * `next dev`. That is exactly the distinction the owner asked for: localhost yes, deployed no.
 *
 * 🔴 IT IS EVALUATED PER CALL, NEVER CAPTURED IN A MODULE CONSTANT. A constant read at import time
 * is not testable — the test that proves this 404s under production has to be able to set the
 * variable — and an untestable gate in front of an unauthenticated parse endpoint is the shape of
 * defect this repo has paid for repeatedly.
 */

/** Is this a development environment, where the Lab may run? */
export function labEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production";
}

/**
 * The refusal every Lab API route returns when it must not run.
 *
 * `null` means "carry on". A 404 rather than a 403 because a route that is off should not be
 * discoverable: "this does not exist here" is both true and the least informative honest answer.
 */
export function labRouteRefusal(env: NodeJS.ProcessEnv = process.env): Response | null {
  if (labEnabled(env)) return null;
  return new Response(JSON.stringify({ error: "Not found" }), {
    headers: { "Content-Type": "application/json" },
    status: 404,
  });
}
