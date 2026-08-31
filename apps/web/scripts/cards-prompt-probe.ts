/**
 * What the card writer actually returns, from the shipped prompt.
 *
 * Usage, from apps/web (reads DEEPSEEK_API_KEY from .env.local):
 *   pnpm tsx --env-file=.env.local scripts/cards-prompt-probe.ts
 *
 * 🔴 IT IMPORTS THE REAL `CARDS_SYSTEM` rather than pasting a copy. A probe that drifts from the
 * shipped prompt reports on a prompt nobody runs, which is worse than no probe.
 */
import { CARDS_SYSTEM, readCardsFigure, readCardsJson } from "../lib/learn/canvas-deliverables";
import { hasCloze } from "../lib/workspace/study-cloze";

const KEY = process.env.DEEPSEEK_API_KEY ?? "";
if (!KEY) {
  console.error("DEEPSEEK_API_KEY is not set. Run with --env-file=.env.local from apps/web.");
  process.exit(1);
}

/** Two subjects, deliberately from different fields: this product is field-agnostic, and a probe
 *  that only ever asks about biology would not notice a prompt that had quietly scoped itself. */
const MATERIAL: { label: string; text: string }[] = [
  {
    label: "Contract law (no diagram in the material)",
    text: `Consideration is what each side gives up for a contract to bind. It must be sufficient
but need not be adequate: the courts ask whether something of value was exchanged, not whether the
bargain was a good one. Past consideration is not good consideration, because a promise given after
the act cannot have induced it. An existing duty is not consideration either, unless a practical
benefit accrues to the promisor (Williams v Roffey Bros). Promissory estoppel can suspend a right
without consideration, but it is a shield and not a sword: it defends against enforcement, it does
not create a cause of action.`,
  },
  {
    label: "Mechanical engineering (material describes a labelled diagram)",
    text: `The four-stroke engine cycle repeats over two crankshaft revolutions. On the intake
stroke the piston descends and the inlet valve opens, drawing the charge in. On compression both
valves close and the piston rises, raising temperature and pressure. Ignition occurs near top dead
centre; the power stroke drives the piston down and is the only stroke that does work on the
crankshaft. On exhaust the outlet valve opens and the rising piston expels the spent gas. The
labelled parts of the cylinder assembly are the piston, connecting rod, crankshaft, inlet valve,
exhaust valve, spark plug and cylinder head.`,
  },
];

async function ask(text: string): Promise<string> {
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    body: JSON.stringify({
      messages: [
        { content: CARDS_SYSTEM, role: "system" },
        { content: text, role: "user" },
      ],
      model: "deepseek-chat",
      temperature: 0.3,
    }),
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    method: "POST",
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

async function main() {
  for (const item of MATERIAL) {
    console.log("\n" + "=".repeat(78) + "\n" + item.label + "\n" + "=".repeat(78));
    const reply = await ask(item.text);
    const cards = readCardsJson(reply) ?? [];
    const figure = readCardsFigure(reply);
    console.log(`\nfigure named for occlusion: ${figure === null ? "(none)" : JSON.stringify(figure)}`);
    console.log(`cards: ${cards.length}\n`);
    cards.forEach((card, at) => {
      const cloze = hasCloze(card.front) ? "  [cloze]" : "";
      console.log(`${String(at + 1).padStart(2)}.${cloze} ${card.front}`);
      console.log(`    → ${card.back}`);
    });
    const longest = cards.reduce((most, card) => Math.max(most, card.back.length), 0);
    const listy = cards.filter((card) => /\b(list|name (the )?(three|four|five|two)|what are the)\b/i.test(card.front));
    console.log(`\n  longest back: ${longest} chars | cloze cards: ${cards.filter((c) => hasCloze(c.front)).length} | multi-answer prompts: ${listy.length}`);
  }
}

void main();
