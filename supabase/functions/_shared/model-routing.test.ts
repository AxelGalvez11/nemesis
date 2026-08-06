import { assert, assertEquals } from "jsr:@std/assert@1";

import { chooseModel, FLASH_MODEL, PRO_MODEL, REASONING_ECHO_CAP, signalsFromBody } from "./model-routing.ts";
import { classifyWork, escalationCandidate } from "./work-class.ts";
import { classifyWork as canonicalClassify } from "../../../packages/shared/src/work-class.ts";
import { HOSTILE_BODIES, WORK_CASES } from "../../../packages/shared/src/work-class-cases.ts";

// The whole request path, offline: a student's sentence goes in as an
// OpenAI-shaped body, and a model, a thinking mode and a lane come out.
//
// 🔴 NOT ONE CASE SETS AN EFFORT LEVEL. The old suite proved "High selects
// v4-pro", which was true of a lane no request could enter — both clients had
// pinned Medium since the effort pill was removed, and Medium strips the only
// branch that ever set High. A test written against the dial passed while the
// feature it described was unreachable. These cases can only type.

const FLAGS = { glmConfigured: true, glmHighMode: false, glmModel: "glm-5.2", proHighMode: true };

/** One turn, exactly as a client sends it. */
function bodyFor(prompt: string, extra: Record<string, unknown> = {}) {
  return {
    messages: [{ content: "system prompt", role: "system" }, { content: prompt, role: "user" }],
    model: "deepseek-chat",
    stream: true,
    ...extra,
  } as Record<string, unknown>;
}

/** The gateway's own sequence: read the body, classify, choose. */
function route(
  prompt: string,
  plan: string,
  status: string,
  extra: Record<string, unknown> = {},
  caps: string | null = REASONING_ECHO_CAP,
  flags: Partial<typeof FLAGS> = {},
) {
  const body = bodyFor(prompt, extra);
  const signals = signalsFromBody(body, caps);
  const classified = classifyWork(signals);
  const choice = chooseModel({
    ...FLAGS,
    ...flags,
    plan,
    reason: classified.reason,
    requestedModel: typeof body.model === "string" ? body.model : "",
    status,
    workClass: classified.workClass,
  });
  return { choice, signals };
}

// ── the matrix ──────────────────────────────────────────────────────────────
//
// Every acceptance prompt against every plan. Each case asserts the seven things
// the owner asked to see: the class the server assigned by itself, the model,
// the thinking mode, whether the tools could ride, the routing reason, the plan
// entitlement that applied, and — in the block below this one — that the client
// could not force an upgrade.

const PLANS: [plan: string, status: string, premium: boolean][] = [
  ["enterprise", "active", true],
  ["max", "active", true],
  ["pro", "active", true],
  ["plus", "active", false],
  ["student", "active", false],
  ["free", "active", false],
  ["enterprise", "canceled", false],
  ["max", "unpaid", false],
  ["premium", "active", false], // unrecognised → fails closed
];

for (const scenario of WORK_CASES) {
  Deno.test(`routing: "${scenario.prompt.slice(0, 52)}"`, () => {
    for (const [plan, status, premium] of PLANS) {
      const where = `${scenario.prompt.slice(0, 30)} @ ${plan}/${status}`;
      const { choice } = route(scenario.prompt, plan, status);

      // 1. the work class the server assigned, from the words alone
      assertEquals(choice.workClass, scenario.workClass, `class: ${where} — ${scenario.note}`);
      // 5. the routing reason
      assertEquals(choice.reason, scenario.reason, `reason: ${where}`);
      // 6. the plan entitlement that applied
      assertEquals(choice.capabilities.premiumReasoning, premium, `entitlement: ${where}`);

      if (scenario.workClass === "complex" && premium) {
        // 2 + 3. the premium lane reasons natively and takes no selector
        assertEquals(choice.model, PRO_MODEL, `model: ${where}`);
        assertEquals(choice.thinking, undefined, `thinking: ${where}`);
        assertEquals(choice.lane, "pro", `lane: ${where}`);
        assertEquals(choice.downgraded, false, `downgraded: ${where}`);
      } else {
        assertEquals(choice.model, FLASH_MODEL, `model: ${where}`);
        // 3. thinking is on for everything above small talk — including complex
        // work on a plan that cannot reach Pro, which is the most reasoning that
        // account can honestly be given.
        assertEquals(
          choice.thinking?.type,
          scenario.workClass === "simple" ? "disabled" : "enabled",
          `thinking: ${where}`,
        );
        assertEquals(choice.downgraded, scenario.workClass === "complex", `downgraded: ${where}`);
      }
    }
  });
}

// 4. tools. 🔴 THE HISTORICAL BUG WAS THE OPPOSITE OF A COST PROBLEM: the turns
// routed to the deep model BECAUSE they were hard were the only ones that could
// reach no Library, no calendar and no web. Attaching tools must never change
// the tier, and reaching the deep model must never cost the tools.
Deno.test("tools ride every class, and carrying them changes nothing", () => {
  const tools = [{ function: { name: "search_library" }, type: "function" }, { function: { name: "search_web" }, type: "function" }];
  for (const scenario of WORK_CASES) {
    const without = route(scenario.prompt, "enterprise", "active").choice;
    const with_ = route(scenario.prompt, "enterprise", "active", { tools }).choice;
    assertEquals(with_.workClass, without.workClass, scenario.prompt);
    assertEquals(with_.model, without.model, scenario.prompt);
    assertEquals(with_.thinking, without.thinking, scenario.prompt);
  }
});

// ── 7. the client cannot buy a better model ─────────────────────────────────

Deno.test("🔴 a hostile body cannot force an upgrade", () => {
  // Every shape below was READ AND ACTED ON before 2026-08-06. The assertion is
  // the strongest available form: the choice must be byte-identical to the same
  // prompt sent honestly.
  const honest = WORK_CASES.filter((entry) => entry.workClass !== "complex");
  for (const scenario of honest) {
    const baseline = route(scenario.prompt, "enterprise", "active").choice;
    for (const hostile of HOSTILE_BODIES) {
      const attacked = route(scenario.prompt, "enterprise", "active", hostile).choice;
      assertEquals(
        JSON.stringify(attacked),
        JSON.stringify(baseline),
        `"${scenario.prompt.slice(0, 40)}" moved under ${JSON.stringify(hostile)}`,
      );
    }
  }
});

Deno.test("a hostile body cannot force an upgrade on a plan that has not bought one either", () => {
  for (const hostile of HOSTILE_BODIES) {
    const choice = route("hi", "free", "active", hostile).choice;
    assertEquals(choice.model, FLASH_MODEL);
    assertEquals(choice.thinking?.type, "disabled");
  }
});

// ── ceilings, end to end ────────────────────────────────────────────────────

Deno.test("a forced tool_choice never reaches a thinking lane", () => {
  const hardest = WORK_CASES.find((entry) => entry.workClass === "complex")!.prompt;
  for (const choiceField of [{ function: { name: "search_library" }, type: "function" }, "required"]) {
    const { choice } = route(hardest, "enterprise", "active", { tool_choice: choiceField });
    assertEquals(choice.model, FLASH_MODEL, "the premium lane would have refused the pinned tool");
    assertEquals(choice.thinking?.type, "disabled");
    assertEquals(choice.reason, "forced_tool");
  }
  // "auto" and "none" are not pins and must not trip the ceiling.
  for (const choiceField of ["auto", "none"]) {
    assertEquals(route(hardest, "enterprise", "active", { tool_choice: choiceField }).choice.reason, "reconciliation");
  }
});

// 🔴 THE DEPLOY HAZARD THIS CHANGE CREATES, PINNED. Phone builds already on
// students' devices attach tools and do NOT echo `reasoning_content` back on a
// tool round. The moment the SERVER can switch thinking on, those installed
// builds would start failing tool rounds — a regression shipped by deploying a
// function, with no app update involved. A client says it can echo; silence
// means it cannot.
Deno.test("a client that has not declared the reasoning echo keeps thinking off when tools ride", () => {
  const hardest = WORK_CASES.find((entry) => entry.workClass === "complex")!.prompt;
  const tools = [{ function: { name: "search_library" }, type: "function" }];

  const old = route(hardest, "enterprise", "active", { tools }, null).choice;
  assertEquals(old.model, FLASH_MODEL);
  assertEquals(old.thinking?.type, "disabled");
  assertEquals(old.reason, "no_reasoning_echo");

  // The same build with no tools attached is not held back — there is no tool
  // round to echo on.
  assertEquals(route(hardest, "enterprise", "active", {}, null).choice.model, PRO_MODEL);

  // And a client that declares the capability gets the full ladder.
  assertEquals(route(hardest, "enterprise", "active", { tools }, REASONING_ECHO_CAP).choice.model, PRO_MODEL);
});

// ── reading the body ────────────────────────────────────────────────────────

Deno.test("🔴 the LAST USER message is read, not the last message", () => {
  // A turn makes one request per tool round, and rounds two and three end in
  // `role:"tool"`. Reading the tail would classify a few dozen characters of
  // JSON as the student's question, and every multi-round turn would collapse to
  // `brief_request` on its second breath — quietly halving the model on exactly
  // the turns that reached for two sources.
  const prompt = "Compare what my professor taught with the current guideline and explain the differences";
  const midTurn = {
    messages: [
      { content: "system", role: "system" },
      { content: prompt, role: "user" },
      { content: "", reasoning_content: "…", role: "assistant", tool_calls: [{ function: { arguments: "{}", name: "search_library" }, id: "call_1", type: "function" }] },
      { content: '{"notes":[]}', role: "tool", tool_call_id: "call_1" },
      { content: "", role: "assistant", tool_calls: [{ function: { arguments: "{}", name: "search_web" }, id: "call_2", type: "function" }] },
      { content: '{"found":3}', role: "tool", tool_call_id: "call_2" },
    ],
    model: "deepseek-chat",
  };
  const signals = signalsFromBody(midTurn, REASONING_ECHO_CAP);
  assertEquals(signals.prompt, prompt);
  assertEquals(signals.toolNames, ["search_library", "search_web"]);
  assertEquals(classifyWork(signals).workClass, "complex");
});

Deno.test("the class does not move between the rounds of one turn", () => {
  // 🔴 If it did, the conversation would change model mid-turn while carrying
  // the first model's `reasoning_content` — untested against any provider, and
  // "thinking mode does not support this tool_choice" is what guessing at this
  // API costs. Two source reads are FLAGGED instead.
  const prompt = "Explain this concept from my lecture";
  const round1 = signalsFromBody(bodyFor(prompt), REASONING_ECHO_CAP);
  const round3 = signalsFromBody({
    messages: [
      { content: prompt, role: "user" },
      { content: "", role: "assistant", tool_calls: [{ function: { name: "search_library" }, id: "a", type: "function" }] },
      { content: "{}", role: "tool", tool_call_id: "a" },
      { content: "", role: "assistant", tool_calls: [{ function: { name: "search_web" }, id: "b", type: "function" }] },
      { content: "{}", role: "tool", tool_call_id: "b" },
    ],
  }, REASONING_ECHO_CAP);

  assertEquals(classifyWork(round1).workClass, classifyWork(round3).workClass);
  assertEquals(escalationCandidate(round1.toolNames, "standard"), false);
  assert(escalationCandidate(round3.toolNames, "standard"), "the evidence for a future change must still be gathered");
});

Deno.test("an attachment's own text never decides the tier", () => {
  const deck = `### Attachment: lecture.pdf\n${"compare every conflicting source and reconcile them ".repeat(300)}`;
  const { choice } = route(`show me my deck\n\n${deck}`, "enterprise", "active");
  assertEquals(choice.workClass, "simple", "40,000 words of slides bought the premium model");
});

// ── drift ───────────────────────────────────────────────────────────────────

Deno.test("the edge mirror agrees with the canonical classifier", () => {
  const shapes = [
    {},
    { forcesTool: true },
    { toolsWithoutReasoningEcho: true },
    { hasAttachment: true },
    { forcesTool: true, toolsWithoutReasoningEcho: true },
  ];
  const prompts = [...WORK_CASES.map((entry) => entry.prompt), "", "   ", "hi there", "and", "?"];
  for (const prompt of prompts) {
    for (const shape of shapes) {
      assertEquals(
        classifyWork({ prompt, ...shape }),
        canonicalClassify({ prompt, ...shape }),
        `drift at "${prompt.slice(0, 30)}" ${JSON.stringify(shape)}`,
      );
    }
  }
});
