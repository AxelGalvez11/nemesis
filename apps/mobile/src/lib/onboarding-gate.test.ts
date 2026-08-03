import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideOnboardingGate, type AccountProbe } from "./onboarding-gate.ts";

const MARKER = { outcome: "finished" as const, at: "2026-08-02T18:30:00.000Z" };

/** Records whether the network probe was reached at all — the point of the
 *  ordering is that on the common path it is NOT. */
function probe(result: AccountProbe) {
  const calls = { count: 0 };
  return {
    calls,
    fn: () => {
      calls.count += 1;
      return Promise.resolve(result);
    },
  };
}

Deno.test("a brand-new account on a brand-new phone gets setup", async () => {
  const p = probe({ hasEvents: false, hasLibrary: false });
  assertEquals(await decideOnboardingGate(null, p.fn), "onboarding");
});

Deno.test("🔴 A LOCAL MARKER SHORT-CIRCUITS BEFORE THE NETWORK CALL", async () => {
  // This is the whole reason the function exists. Nearly every launch is a
  // returning student on a device they have used before; asking the server
  // anything on that path would put a network round trip in front of the app
  // opening, to answer a question the keychain already answered.
  const p = probe({ hasEvents: false, hasLibrary: false });
  assertEquals(await decideOnboardingGate(MARKER, p.fn), "app");
  assertEquals(p.calls.count, 0);
});

Deno.test("a skipped marker counts as answered too", async () => {
  const p = probe({ hasEvents: false, hasLibrary: false });
  assertEquals(await decideOnboardingGate({ outcome: "skipped", at: "" }, p.fn), "app");
  assertEquals(p.calls.count, 0);
});

Deno.test("set up on the laptop, opened on the phone: straight into the app", async () => {
  // No marker on this device, but the account plainly is not new. This is the
  // case the local marker structurally cannot cover, and the reason the account
  // is the real cross-device record.
  for (const account of [
    { hasEvents: true, hasLibrary: false },
    { hasEvents: false, hasLibrary: true },
    { hasEvents: true, hasLibrary: true },
  ]) {
    assertEquals(await decideOnboardingGate(null, probe(account).fn), "app");
  }
});

Deno.test("🔴 AN OFFLINE LAUNCH NEVER INTERRUPTS A RETURNING STUDENT", async () => {
  // A failed probe resolves to "app", the conservative direction. Showing a
  // "welcome, name your courses" screen over the app somebody used yesterday
  // because their train went into a tunnel is unrecoverable; the opposite error
  // costs a genuinely new student one trip to Settings.
  const decision = await decideOnboardingGate(null, () => Promise.reject(new Error("offline")));
  assertEquals(decision, "app");
});
