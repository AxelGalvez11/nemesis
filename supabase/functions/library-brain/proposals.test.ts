import {
  parseLinkProposals,
  proposalMarkdownLine,
} from "./proposals.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("parseLinkProposals only accepts allowlisted, typed, confident edges", () => {
  const raw = JSON.stringify({
    proposals: [
      {
        confidence: 0.91,
        reason: "Clear conceptual dependency.",
        relation: "prerequisite_of",
        target_document_id: "allowed",
      },
      {
        confidence: 0.99,
        reason: "Cross-account UUID.",
        relation: "related_to",
        target_document_id: "forbidden",
      },
      {
        confidence: 0.4,
        reason: "Too speculative.",
        relation: "part_of",
        target_document_id: "allowed-2",
      },
      {
        confidence: 0.9,
        reason: "Invented operation.",
        relation: "delete_note",
        target_document_id: "allowed-2",
      },
    ],
  });
  const parsed = parseLinkProposals(
    raw,
    new Set(["allowed", "allowed-2"]),
    "source",
  );
  assert(parsed.length === 1, "only one proposal should survive");
  assert(parsed[0]?.target_document_id === "allowed", "wrong target survived");
});

Deno.test("parseLinkProposals tolerates a fenced JSON response and deduplicates", () => {
  const raw = `\`\`\`json
  {"proposals":[
    {"target_document_id":"a","relation":"related_to","reason":"Same topic.","confidence":0.8},
    {"target_document_id":"a","relation":"related_to","reason":"Duplicate.","confidence":0.9}
  ]}
  \`\`\``;
  const parsed = parseLinkProposals(raw, new Set(["a"]), "source");
  assert(parsed.length === 1, "duplicate edge was not removed");
});

Deno.test("proposalMarkdownLine creates the portable readable relation contract", () => {
  const line = proposalMarkdownLine("contrasts_with", "ACE inhibitors\n]]");
  assert(
    line === "- Contrasts with: [[ACE inhibitors]]",
    `unexpected line: ${line}`,
  );
});

