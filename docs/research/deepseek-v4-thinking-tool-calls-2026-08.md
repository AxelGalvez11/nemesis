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

`apps/web/lib/workspace/chat-effort.ts:toolsAllowed()` returned `false` for every reasoner route
and every High-effort turn. Its comment blamed the echo requirement above, "which our stream
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
- Never sends `tool_choice` or the legacy `function_call` on any route at any effort
  (`completionPayload`).
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
`supabase/functions/_shared/model-routing.ts` preserves that. `deepseek-v4-pro` is reached only by
the High lane on an entitled plan. Reading the alias as "the premium model" is the easiest mistake
to make in this area and was made once already in a PR description.
