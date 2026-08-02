// The phone's half of first-run setup: persistence, and how it fails.
// The RULES are tested once, in packages/shared/src/onboarding.test.ts.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ONBOARDING_KEY, readOnboarding, writeOnboarding, type OnboardingStore } from "./onboarding.ts";

/** An in-memory stand-in for expo-secure-store. */
function fakeStore(initial: Record<string, string> = {}): OnboardingStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItemAsync: (key) => Promise.resolve(data[key] ?? null),
    setItemAsync: (key, value) => {
      data[key] = value;
      return Promise.resolve();
    },
  };
}

/** A store whose every operation throws — a locked or flaky keychain. */
const brokenStore: OnboardingStore = {
  getItemAsync: () => Promise.reject(new Error("keychain unavailable")),
  setItemAsync: () => Promise.reject(new Error("keychain unavailable")),
};

const AT = new Date("2026-08-02T18:30:00.000Z");

Deno.test("a phone that has never run setup has no marker", async () => {
  assertEquals(await readOnboarding(fakeStore()), null);
});

Deno.test("finishing setup round-trips through the store", async () => {
  const store = fakeStore();
  await writeOnboarding(store, "finished", AT);
  assertEquals(await readOnboarding(store), { outcome: "finished", at: "2026-08-02T18:30:00.000Z" });
});

Deno.test("skipping is remembered as firmly as finishing", async () => {
  // Both mean "do not ask again". They stay distinguishable so we can later tell
  // a student who set up from one who bailed.
  const store = fakeStore();
  await writeOnboarding(store, "skipped", AT);
  assertEquals((await readOnboarding(store))?.outcome, "skipped");
});

Deno.test("the phone's key does not collide with the web's", () => {
  // The two stores are unrelated; only the ACCOUNT is the cross-device record.
  assertEquals(ONBOARDING_KEY, "nemesis.mobile.onboarding.v1");
});

Deno.test("garbage in the store reads as 'never ran', not as a crash", async () => {
  for (const junk of ["", "{", "null", "[]", '{"outcome":"maybe"}', '"finished"']) {
    assertEquals(await readOnboarding(fakeStore({ [ONBOARDING_KEY]: junk })), null);
  }
});

Deno.test("🔴 AN UNREADABLE KEYCHAIN MEANS 'SHOW SETUP', NEVER 'ALREADY DONE'", async () => {
  // The safe direction. shouldShowOnboarding still suppresses the flow for any
  // account with content, so the worst case here is offering setup twice to a
  // genuinely empty account. Defaulting the other way would deny setup to every
  // new student on a device with a flaky keychain, which is unrecoverable.
  assertEquals(await readOnboarding(brokenStore), null);
});

Deno.test("a failed write never throws at the student", async () => {
  // They finished setup. Failing to write the note must not strand them on the
  // last screen with an error they cannot act on.
  await writeOnboarding(brokenStore, "finished", AT);
});
