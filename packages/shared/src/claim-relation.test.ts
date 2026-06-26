import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CLAIM_RELATION_LABEL, type ClaimRelation } from "./claim-relation.ts";

Deno.test("claim relation labels expose the evidence UI vocabulary", () => {
  const relation: ClaimRelation = "supports";
  assertEquals(CLAIM_RELATION_LABEL[relation], "Supports");
  assertEquals(CLAIM_RELATION_LABEL.conflicts, "Conflicts");
});
