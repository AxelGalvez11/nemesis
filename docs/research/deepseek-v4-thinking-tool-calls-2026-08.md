# DeepSeek V4 thinking mode and tool calls

Written 2026-08-06 to replace a citation that did not exist. `apps/web/lib/workspace/agent-tools.ts`
pointed at `docs/research/deepseek-tool-calling-fix-2026-07.md` as the evidence for never sending
`tool_choice`. That file has never been in the repository. The rule it cited is correct; the
evidence for it was in a different file all along, and this document collects it.

## The provider rule

DeepSeek V4 models default to **thinking mode**. Thinking mode does not accept a forced tool
choice. The provider rejects the request with:

> Thinking mode does not support this tool_choice

Source: `api-docs.deepseek.com/guides/tool_calls`. Quoted verbatim in
`supabase/functions/ask/llm.ts`, which met it in production and works around it by sending
`tools: undefined, tool_choice: undefined` on the reasoner leg and asking for JSON as plain text
instead.

The second rule, from `api-docs.deepseek.com/guides/thinking_mode`:

> When a model performs a tool call between two user messages, the intermediate assistant's
> `reasoning_content` must participate in context concatenation and be passed back to the API in
> all subsequent user interaction turns.

Note *all subsequent* turns, not merely the next one. A four-round sequence must still carry round
one's reasoning at round four.

## The production error we caused ourselves

Not a provider error — a silent capability loss, which is worse because nothing logs it.

`apps/web/lib/workspace/chat-effort.ts:toolsAllowed()` (since deleted) returned `false` for every
reasoner route and every High-effort turn. Its comment blamed the echo requirement above, "which our stream
doesn't retain". That was accurate about our code and wrong about its implication:
`readCompletionStreamFull` was accumulating `reasoning_content` into a local and then returning
`{ text, toolCalls }` without it. The field was never unavailable. It was discarded.

The observable consequence, measured 2026-08-06 against the source-routing acceptance set: the
turns routed to the reasoner *because they were hard* were the only ones that could not reach the
student's Library, their calendar, or the web. "Compare what my professor taught with the current
guideline" needs two sources and could reach neither. Raising the effort dial made Nemesis less
able to look anything up.

## What Nemesis does now

- Retains `reasoning_content` from both the streamed and non-streamed paths
  (`chat-stream.ts`, `completionReasoning`).
- Echoes it on the assistant message that carries `tool_calls`, every round
  (`appendToolRound`).
- Never sends `tool_choice` or the legacy `function_call` on any route (`completionPayload`), and
  the gateway refuses to enable thinking on any request that carries one — the provider answers a
  pinned tool in thinking mode with a 400 reading "Thinking mode does not support this tool_choice".
- Strips `reasoning_content` before the turn returns, so it can never be persisted or rendered.
- Strips DeepSeek-only fields — including message-level `reasoning_content` — before any request
  reaches GLM, Qwen, Kimi or Anthropic (`stripDeepSeekOnlyFields`).

Pinned by `apps/web/lib/workspace/deepseek-v4-thinking.test.ts` (our side of the contract) and
`apps/web/scripts/deepseek-v4-gate.mts` (the provider's side, needs a device key).

## What is still unverified

That the provider accepts our shape across rounds. Everything above is a code reading plus the
provider's own documentation. The gate exists to replace that with a round trip; until it runs,
"the docs say this works" is what we have.

## A note on model names

`deepseek-reasoner` **never meant `deepseek-v4-pro`.** The retired alias mapped to
`deepseek-v4-flash` with thinking enabled, and `resolveAlias` in
`supabase/functions/_shared/model-routing.ts` preserves that. `deepseek-v4-pro` is reached only when the
server judges a turn **complex** *and* the plan is entitled. Reading the alias as "the premium
model" is the easiest mistake to make in this area and was made once already in a PR description.

## Who decides how hard to think (changed 2026-08-06)

Nemesis has no user-facing effort selector and does not want one (owner: "Model effort is supposed
to be selected automatically"). Everything above described a client that chose: it sent
`reasoning_effort`, and it alternated `deepseek-chat` / `deepseek-reasoner` to pick the thinking
mode. Both were spending decisions taken in a browser, changeable by editing one line of JSON.

Two things were true at once, and only the second was reported at first:

1. The plan gate `ctx.plan === 'pro' || 'max'` matched no production account (all are `enterprise`).
2. **No client had sent High since the composer's effort pill was removed** — phone #369, web
   2026-07-31. Both surfaces pin Medium, and `applyChatEffort(d, "medium")` *strips* the only
   branch that ever set it. The premium lane was therefore unreachable for two independent
   reasons, and fixing the plan gate alone would have changed nothing.

The server now classifies each turn from the student's own words
(`packages/shared/src/work-class.ts`, mirrored to `supabase/functions/_shared/`) into
`simple` / `standard` / `complex`, and picks Flash / Flash-with-thinking / v4-pro accordingly.
Clients send no effort field and a constant model name; the gateway deletes every effort encoding
rather than reading it.

Two ceilings override the class, both about what the *request* can survive:

- a body carrying `tool_choice` never gets thinking (the 400 above);
- a client that has not declared `x-nemesis-caps: reasoning-echo` never gets thinking on a turn
  that attaches tools. The iOS app does not echo `reasoning_content` on tool rounds, and builds
  already installed on students' devices cannot be updated by deploying an edge function.

A debug override exists for investigations and is gated on a server secret (`DEBUG_ROUTE_KEY`),
unset by default; no client can reach it.
