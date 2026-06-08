// Deno unit tests for opt-out persistence. Run: deno test --no-check apps/mobile/src/lib/analyticsConsent.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type ConsentStore, hydrateOptOut, persistOptOut } from "./analyticsConsent.ts";
import { isOptedOut, setOptOut } from "./analytics.ts";

function memStore(initial: Record<string, string> = {}): ConsentStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItemAsync: (k) => Promise.resolve(k in data ? data[k] : null),
    setItemAsync: (k, v) => {
      data[k] = v;
      return Promise.resolve();
    },
  };
}

Deno.test("hydrateOptOut loads a persisted opt-out (true) into the core", async () => {
  setOptOut(false);
  await hydrateOptOut(memStore({ analytics_opt_out: "true" }));
  assert(isOptedOut());
  setOptOut(false);
});

Deno.test("hydrateOptOut loads a persisted opt-in (false)", async () => {
  setOptOut(true);
  await hydrateOptOut(memStore({ analytics_opt_out: "false" }));
  assertEquals(isOptedOut(), false);
});

Deno.test("hydrateOptOut leaves the default when nothing is persisted", async () => {
  setOptOut(false);
  await hydrateOptOut(memStore({}));
  assertEquals(isOptedOut(), false);
  setOptOut(false);
});

Deno.test("hydrateOptOut never throws on a read failure", async () => {
  setOptOut(false);
  const failing: ConsentStore = {
    getItemAsync: () => Promise.reject(new Error("keychain locked")),
    setItemAsync: () => Promise.resolve(),
  };
  await hydrateOptOut(failing); // must not throw
  assertEquals(isOptedOut(), false);
});

Deno.test("persistOptOut updates the core in-memory AND writes to the store", async () => {
  setOptOut(false);
  const store = memStore();
  await persistOptOut(store, true);
  assert(isOptedOut());
  assertEquals(store.data.analytics_opt_out, "true");
  setOptOut(false);
});

Deno.test("persistOptOut still updates in-memory if the write fails", async () => {
  setOptOut(false);
  const failing: ConsentStore = {
    getItemAsync: () => Promise.resolve(null),
    setItemAsync: () => Promise.reject(new Error("disk full")),
  };
  await persistOptOut(failing, true); // must not throw
  assert(isOptedOut());
  setOptOut(false);
});
