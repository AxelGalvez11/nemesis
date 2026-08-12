import { assert, assertEquals } from "jsr:@std/assert@1";

import { resolvePlanCapabilities } from "./plan-capabilities.ts";
import { resolvePlanCapabilities as canonical } from "../../../packages/shared/src/plan-capabilities.ts";
import { chooseModel, FLASH_MODEL, PRO_MODEL, stripDeepSeekOnlyFields } from "./model-routing.ts";
import type { WorkClass } from "./work-class.ts";

// Every plan string that can appear in `subscriptions.plan`, gathered from the
// CHECK constraints across migrations 0109, 0122 and 20260720101500 — not an
// idealised ladder. Plus the shapes a bad webhook write can produce.
const PLANS = ["free", "plus", "student", "pro", "professional", "max", "enterprise"];
// Genuinely unknown strings only. "Pro " and "MAX" are NOT here: the resolver
// trims and lower-cases before matching, on purpose, because a webhook that
// writes a capitalised plan must not silently unentitle a paying account. That
// tolerance is asserted separately below.
const BAD_PLANS = ["", "  ", "premium", "enterprise_annual", "pro_annual", "team", null, undefined];
const ENTITLING = ["active", "trialing", "past_due"];
const NOT_ENTITLING = ["canceled", "cancelled", "incomplete", "incomplete_expired", "unpaid", "paused", "", null, undefined];

const flags = { glmConfigured: true, glmHighMode: false, glmModel: "glm-5.2", proHighMode: true };

Deno.test("the matrix: every plan against every status", () => {
  for (const plan of PLANS) {
    for (const status of ENTITLING) {
      const caps = resolvePlanCapabilities(plan, status);
      assert(caps.tier !== "none", `${plan}/${status} resolved to nothing`);
      assertEquals(caps.limitsPlanCode, plan, "numeric limits stay under the account's own plan code");
    }
    for (const status of NOT_ENTITLING) {
      const caps = resolvePlanCapabilities(plan, status);
      // 🔴 A cancelled Max is a cancelled account. Status is read BEFORE plan;
      // the other order is how an expired subscription keeps its perks.
      assertEquals(caps.tier, "none", `${plan}/${status} kept a tier`);
      assertEquals(caps.paid, false);
      assertEquals(caps.premiumReasoning, false);
      assertEquals(caps.highestReasoningTier, false);
      assertEquals(caps.premiumModels, false);
    }
  }
});

Deno.test("enterprise is max-equivalent, which is the bug this fixes", () => {
  const enterprise = resolvePlanCapabilities("enterprise", "active");
  const max = resolvePlanCapabilities("max", "active");
  assertEquals(enterprise.tier, "max");
  assertEquals(enterprise.premiumReasoning, max.premiumReasoning);
  assertEquals(enterprise.highestReasoningTier, max.highestReasoningTier);
  assertEquals(enterprise.premiumModels, max.premiumModels);
  // But its numeric limits stay its own — enterprise's seeded rows are more
  // generous than max's, and "max-equivalent" must not mean "cut to max".
  assertEquals(enterprise.limitsPlanCode, "enterprise");
});

Deno.test("the paid ladder grants what it should and nothing more", () => {
  const free = resolvePlanCapabilities("free", "active");
  assertEquals(free.paid, false);
  assertEquals(free.premiumReasoning, false);

  const student = resolvePlanCapabilities("plus", "active");
  assertEquals(student.tier, "student");
  assertEquals(student.paid, true, "Student is a paid plan");
  assertEquals(student.premiumReasoning, false, "…but does not buy the premium reasoning model");
  assertEquals(student.premiumModels, false);

  const pro = resolvePlanCapabilities("pro", "active");
  assertEquals(pro.premiumReasoning, true);
  assertEquals(pro.premiumModels, true);
});

Deno.test("an unrecognised plan grants nothing and says so", () => {
  for (const plan of BAD_PLANS) {
    const caps = resolvePlanCapabilities(plan, "active");
    assertEquals(caps.tier, "none", `${String(plan)} was granted a tier`);
    assertEquals(caps.paid, false);
    assert(caps.unrecognisedPlan, `${String(plan)} failed closed but silently`);
  }
  // A recognised plan never sets the flag — otherwise the telemetry is noise
  // and gets muted, which is how the next unknown plan goes unnoticed.
  for (const plan of PLANS) {
    assertEquals(resolvePlanCapabilities(plan, "active").unrecognisedPlan, undefined);
  }
});

Deno.test("case and whitespace from a webhook do not decide entitlement", () => {
  assertEquals(resolvePlanCapabilities(" Enterprise ", "Active").tier, "max");
  assertEquals(resolvePlanCapabilities("PRO", " active").premiumReasoning, true);
});

// 🔴 The mirror. Two copies exist because edge functions cannot import across
// the workspace root; this is what stops them becoming two different opinions.
Deno.test("the edge mirror and the canonical resolver agree on every cell", () => {
  for (const plan of [...PLANS, ...BAD_PLANS]) {
    for (const status of [...ENTITLING, ...NOT_ENTITLING]) {
      assertEquals(
        resolvePlanCapabilities(plan, status),
        canonical(plan, status),
        `drift at ${String(plan)}/${String(status)}`,
      );
    }
  }
});

// ── model selection ─────────────────────────────────────────────────────────

// 🔴 THE WORK CLASS IS THE INPUT NOW, NOT AN EFFORT FLAG FROM THE CLIENT. The
// prompts that produce each class live in work-class-cases.ts, and the matrix
// that runs them end to end lives in model-routing.test.ts. What is left here is
// the entitlement half: given a class, which plans reach which lane.
const choose = (plan: string, status: string, requestedModel: string, workClass: WorkClass, extra: Partial<typeof flags> = {}) =>
  chooseModel({ ...flags, ...extra, plan, reason: "default", requestedModel, status, workClass });

Deno.test("complex work on active enterprise selects deepseek-v4-pro", () => {
  const choice = choose("enterprise", "active", "deepseek-chat", "complex");
  assertEquals(choice.model, PRO_MODEL);
  assertEquals(choice.lane, "pro");
  assertEquals(choice.dropEffortSelectors, true, "v4-pro takes no thinking or effort selector");
  assertEquals(choice.downgraded, false);
});

// 🔴 The owner's explicit limit: "Do not make every Enterprise request use Pro."
// An entitled account must not buy the premium model to answer "hi".
Deno.test("simple and standard work stay on Flash, even on enterprise", () => {
  const simple = choose("enterprise", "active", "deepseek-chat", "simple");
  assertEquals(simple.model, FLASH_MODEL);
  assertEquals(simple.thinking?.type, "disabled");
  assertEquals(simple.lane, "flash");

  const standard = choose("enterprise", "active", "deepseek-chat", "standard");
  assertEquals(standard.model, FLASH_MODEL);
  assertEquals(standard.thinking?.type, "enabled", "ordinary work still thinks — on the fast model");
  assertEquals(standard.lane, "flash-thinking");
});

Deno.test("complex work on a plan that has not bought it is not refused, only not upgraded", () => {
  // Owner's rule: "For noneligible plans, complex work should still use
  // Flash-thinking and complete honestly within that plan's limits."
  for (const plan of ["free", "plus"]) {
    const choice = choose(plan, "active", "deepseek-chat", "complex");
    assertEquals(choice.model, FLASH_MODEL, `${plan} reached the premium model`);
    assertEquals(choice.thinking?.type, "enabled", `${plan} lost its thinking`);
    assertEquals(choice.downgraded, true, "a plan limit that nothing records is a plan limit nobody can see");
  }
});

Deno.test("a cancelled enterprise account gets no premium model", () => {
  const choice = choose("enterprise", "canceled", "deepseek-chat", "complex");
  assertEquals(choice.model, FLASH_MODEL);
  assertEquals(choice.capabilities.tier, "none");
});

Deno.test("a client cannot buy v4-pro by naming it", () => {
  const choice = choose("free", "active", "deepseek-v4-pro", "simple");
  assertEquals(choice.model, FLASH_MODEL, "premium routing is server-owned");
  assertEquals(choice.thinking?.type, "disabled", "and naming it must not switch thinking on either");
});

// 🔴 The retired aliases still arrive from every shipped build, and they used to
// select the thinking mode. They are now ignored — the same string, two classes,
// two different answers, decided entirely by the server.
Deno.test("the client's model alias no longer selects the thinking mode", () => {
  for (const alias of ["deepseek-chat", "deepseek-reasoner", "gpt-4o", ""]) {
    assertEquals(choose("free", "active", alias, "simple").thinking?.type, "disabled", alias);
    assertEquals(choose("free", "active", alias, "standard").thinking?.type, "enabled", alias);
  }
});

Deno.test("the GLM lane needs its own flag as well as the tier", () => {
  assertEquals(choose("enterprise", "active", "deepseek-chat", "complex", { glmHighMode: false }).lane, "pro");
  assertEquals(choose("enterprise", "active", "deepseek-chat", "complex", { glmHighMode: true }).model, "glm-5.2");
  // Flag on, tier too low: still no GLM.
  assertEquals(choose("plus", "active", "deepseek-chat", "complex", { glmHighMode: true }).model, FLASH_MODEL);
  // An explicit `glm*` request is a different product surface, not a tier, and
  // is still honoured by name.
  assertEquals(choose("free", "active", "glm-5.2", "simple").lane, "glm");
});

Deno.test("PRO_HIGH_MODE off drops the premium lane without dropping the student", () => {
  const choice = choose("enterprise", "active", "deepseek-chat", "complex", { proHighMode: false });
  assertEquals(choice.model, FLASH_MODEL);
  assertEquals(choice.thinking?.type, "enabled");
  assertEquals(choice.downgraded, true);
});

// ── cross-provider hygiene ──────────────────────────────────────────────────

Deno.test("DeepSeek-only fields never reach another provider", () => {
  const body = {
    messages: [
      { content: "sys", role: "system" },
      { content: "", reasoning_content: "PRIVATE THINKING", role: "assistant", tool_calls: [{ id: "call_1" }] },
      { content: "{}", role: "tool", tool_call_id: "call_1" },
    ],
    model: "deepseek-v4-flash",
    reasoning_effort: "high",
    thinking: { type: "enabled" },
  };
  const cleaned = stripDeepSeekOnlyFields(body);
  assertEquals("thinking" in cleaned, false);
  assertEquals("reasoning_effort" in cleaned, false);
  const messages = cleaned.messages as Record<string, unknown>[];
  assertEquals("reasoning_content" in messages[1], false, "the reasoning followed the conversation to another vendor");
  // Everything the next provider DOES need survives.
  assertEquals(messages[1].tool_calls, body.messages[1].tool_calls);
  assertEquals(messages[2].tool_call_id, "call_1");
  assertEquals(messages.length, 3);
  // And the original is untouched — the failover retries from the same body.
  assertEquals("reasoning_content" in (body.messages[1] as Record<string, unknown>), true);
});
