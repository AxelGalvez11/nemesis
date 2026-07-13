// npx tsx lib/deepseek-balance.test.ts
import assert from "node:assert/strict";
import { buildBalanceAlertEmail, evaluateProviderBalance } from "./deepseek-balance";

const healthy = { is_available: true, balance_infos: [{ currency: "USD", total_balance: "42.50" }] };
assert.deepEqual(evaluateProviderBalance(healthy, 5), { status: "healthy", alert: false, totalUsd: 42.5 });
assert.equal(buildBalanceAlertEmail(evaluateProviderBalance(healthy, 5), 5), null);

// Below the alert line.
const low = { is_available: true, balance_infos: [{ currency: "USD", total_balance: "3.10" }] };
const lowCheck = evaluateProviderBalance(low, 5);
assert.deepEqual(lowCheck, { status: "below_threshold", alert: true, totalUsd: 3.1 });
assert.match(buildBalanceAlertEmail(lowCheck, 5)!.subject, /low \(\$3\.10 left\)/);

// Exhausted account = full outage.
const out = { is_available: false, balance_infos: [{ currency: "USD", total_balance: "0.00" }] };
const outCheck = evaluateProviderBalance(out, 5);
assert.deepEqual(outCheck, { status: "unavailable", alert: true, totalUsd: 0 });
assert.match(buildBalanceAlertEmail(outCheck, 5)!.subject, /DOWN/);

// USD picked among multiple currencies.
const multi = {
  is_available: true,
  balance_infos: [
    { currency: "CNY", total_balance: "100.00" },
    { currency: "usd", total_balance: "7.00" },
  ],
};
assert.equal(evaluateProviderBalance(multi, 5).totalUsd, 7);

// Numeric total_balance also accepted.
assert.equal(evaluateProviderBalance({ is_available: true, balance_infos: [{ currency: "USD", total_balance: 12 }] }, 5).totalUsd, 12);

// Anything unreadable is fail-loud.
for (const bad of [null, undefined, "nope", {}, { is_available: true }, { is_available: true, balance_infos: [] }, { is_available: true, balance_infos: [{ currency: "USD", total_balance: "abc" }] }]) {
  const check = evaluateProviderBalance(bad, 5);
  assert.equal(check.status, "unreadable", `expected unreadable for ${JSON.stringify(bad)}`);
  assert.equal(check.alert, true);
  assert.match(buildBalanceAlertEmail(check, 5)!.subject, /could not read/);
}

// Threshold boundary: exactly at the line is NOT an alert.
assert.equal(evaluateProviderBalance({ is_available: true, balance_infos: [{ currency: "USD", total_balance: "5.00" }] }, 5).alert, false);

console.log("deepseek-balance.test.ts OK");
