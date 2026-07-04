import assert from "node:assert/strict";
import { capText, guessTitle } from "./extract";

// capText: caps at the limit and reports truncation honestly.
{
  const short = capText("hello world", 100);
  assert.equal(short.text, "hello world");
  assert.equal(short.truncated, false);
}
{
  const long = capText("abcdefghij", 5);
  assert.equal(long.text, "abcde");
  assert.equal(long.truncated, true);
}
{
  // Exactly at the cap is NOT truncated.
  const exact = capText("abcde", 5);
  assert.equal(exact.truncated, false);
}

// guessTitle: first non-trivial line, trimmed; null when nothing plausible.
{
  const t = guessTitle("  \n\nEffect of Drug X on Mortality: A Randomized Trial\nAuthors et al.\nAbstract...");
  assert.equal(t, "Effect of Drug X on Mortality: A Randomized Trial");
}
{
  // A very short first line (page header noise) is skipped in favor of the next plausible line.
  const t = guessTitle("1\nPMID: 12345\nA Well-Formed Study Title That Is Clearly The Paper Name\n");
  assert.equal(t, "A Well-Formed Study Title That Is Clearly The Paper Name");
}
{
  assert.equal(guessTitle("   \n \n "), null);
}

console.log("extract.test.ts: all assertions passed");
