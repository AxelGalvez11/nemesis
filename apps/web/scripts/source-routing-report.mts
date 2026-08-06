// Measures the CURRENT engine against the source-routing acceptance set.
//
// Run: node_modules/.bin/tsx apps/web/scripts/source-routing-report.mts
//
// This exists to produce a real "before" number rather than an argued one. It
// drives the SHIPPING functions — classifyChatRequest, shouldSearchWeb,
// toolsAllowed — and reassembles the same decision sendChatTurn makes, so the
// output describes the product and not a model of it.
//
// 🔴 TWO WAYS THIS IS GENEROUS TO THE CURRENT ENGINE, both deliberate:
//   1. The model pre-flight (chat-web-need.ts) is skipped, because it needs the
//      network. It can only turn MORE searches on, never fewer — so every
//      over-search this reports is a floor, not an estimate.
//   2. A private source only counts as MISSED when its tools never rode the
//      turn at all. When they did ride, whether the model called them is
//      unknown here and scores as nothing. So every private-source failure
//      below is a turn where the right answer was structurally out of reach —
//      not one where the model merely chose not to look.

import { toolsAllowed } from "../lib/workspace/chat-effort";
import { classifyChatRequest, type ChatRouteDecision } from "../lib/workspace/chat-routing";
import { shouldSearchWeb } from "../lib/workspace/chat-web-search";
import { ROUTING_CASES, type RoutingCase } from "../lib/workspace/source-routing-cases";
import { formatRoutingReport, scoreRouting, type ObservedSources } from "../lib/workspace/source-routing-score";

/** sendChatTurn's decision, reassembled from the shipping parts. */
function currentEngine(testCase: RoutingCase): ObservedSources {
  const ask = testCase.ask;
  const classified = classifyChatRequest(ask, "");
  const regexSaidYes = classified.workspaceIntent
    ? classified.searchWeb
    : classified.searchWeb || shouldSearchWeb(ask);
  const needsWeb = regexSaidYes;
  const routed: ChatRouteDecision = needsWeb && classified.route === "conversation" && !classified.workspaceIntent
    ? { model: "deepseek-reasoner", route: "current", searchWeb: true }
    : classified;
  // Reachable → unknown (the model may or may not call it). Unreachable →
  // a definite miss, because no tool for it rode the turn.
  const privateSeen = toolsAllowed(routed) ? null : false;
  return { library: privateSeen, schedule: privateSeen, web: needsWeb };
}

const report = scoreRouting(ROUTING_CASES, currentEngine);
console.log(formatRoutingReport("current engine", report));
console.log("");
for (const failure of report.failures) {
  const flags = [
    failure.overSearched ? "over-searched" : "",
    failure.underSearched ? "under-searched" : "",
    failure.wrongSource ? "WRONG SOURCE" : "",
    failure.missing > (failure.underSearched ? 1 : 0) ? "private source unreachable" : "",
  ].filter(Boolean).join(", ");
  console.log(`${failure.hard ? "HARD " : "     "}${JSON.stringify(failure.ask)}\n       ${flags}`);
}
