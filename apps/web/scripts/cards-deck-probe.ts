/**
 * The whole flashcard chain, end to end, on material that describes a labelled diagram.
 *
 * Usage, from apps/web:
 *   pnpm tsx --env-file=<path>/.env.local scripts/cards-deck-probe.ts <figure.json>
 *
 * 🔴 WHAT IS LIVE AND WHAT IS REPLAYED, STATED SO NOBODY OVERCLAIMS. The card writing is a real
 * DeepSeek call against the shipped `CARDS_SYSTEM`. The card typing, the figure read and the
 * occlusion card construction are the real shipped functions. The VISION read is not made fresh:
 * the vision key is not on this machine, so the figure is a real read production already performed
 * and cached in `figure_occlusion_cache`. Same boxes, same labels, not a new bill.
 */
import { readFileSync } from "node:fs";

import { CARDS_SYSTEM, readCardsFigure, readCardsJson } from "../lib/learn/canvas-deliverables";
import { dropCardsCoveredByFigure } from "../lib/learn/canvas-figure-occlusion";
import { occlusionCards } from "../lib/learn/occlusion-from-labels";
import { readFigureSubject } from "../lib/learn/figure-subject";
import { hasCloze } from "../lib/workspace/study-cloze";
import type { LabelledFigure } from "../lib/learn/occlusion-from-labels";

const KEY = process.env.DEEPSEEK_API_KEY ?? "";
if (!KEY) {
  console.error("DEEPSEEK_API_KEY is not set.");
  process.exit(1);
}

const MATERIAL = `The heart is a four-chambered pump. Deoxygenated blood arrives from the body
through the superior and inferior vena cava into the right atrium, passes the tricuspid valve into
the right ventricle, and leaves through the pulmonary valve into the pulmonary artery to reach the
lungs. Oxygenated blood returns by the pulmonary veins into the left atrium, passes the mitral valve
into the left ventricle, and is driven through the aortic valve into the aorta. The left ventricle
has the thickest wall because it pumps against systemic resistance, while the right ventricle pumps
only to the lungs. The diagram of the heart labels the chambers, the four valves, the great vessels
and the pericardium.`;

async function main() {
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    body: JSON.stringify({
      messages: [
        { content: CARDS_SYSTEM, role: "system" },
        { content: MATERIAL, role: "user" },
      ],
      model: "deepseek-chat",
      temperature: 0.3,
    }),
    headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    method: "POST",
  });
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const reply = json.choices?.[0]?.message?.content ?? "";

  const written = readCardsJson(reply) ?? [];
  const named = readCardsFigure(reply);
  const subject = readFigureSubject(named);

  console.log("\n== WHAT THE MODEL RETURNED ==");
  console.log(`figure named: ${named === null ? "(none)" : JSON.stringify(named)}  ->  subject: ${JSON.stringify(subject)}`);
  console.log(`written cards: ${written.length}\n`);
  written.forEach((card, at) => {
    const type = hasCloze(card.front) ? "cloze" : "basic";
    console.log(`${String(at + 1).padStart(2)}. [${type}] ${card.front}`);
    console.log(`    -> ${card.back}`);
  });

  // 🔴 THE REAL `occlusionCards`, on a real cached vision read. Nothing here is hand-written.
  const figure = JSON.parse(readFileSync(process.argv[2] ?? "", "utf8")) as LabelledFigure;
  const image = occlusionCards(figure);
  console.log(`\n== IMAGE OCCLUSION CARDS, built by occlusionCards() ==`);
  console.log(`figure: ${figure.width}x${figure.height}, ${figure.boxes.length} boxes read by vision\n`);
  // 🔴 ALL OF THEM, NOT A SAMPLE. This printed the first four and then a count, and the truncation
  // read as "only four cards were made" — the owner asked why fourteen masks had not produced
  // fourteen cards. They had. A probe that abbreviates its own evidence invites that question.
  image.forEach((card, at) => {
    const payload = card.payload as { targetId?: string; shapes?: { id: string; label?: string }[] };
    const target = payload.shapes?.find((shape) => shape.id === payload.targetId);
    console.log(`${String(at + 1).padStart(2)}. [image_occlusion] ${card.front}`);
    console.log(`    -> ${card.back}`);
    console.log(`    masks: ${payload.shapes?.length ?? 0} | hidden: ${JSON.stringify(target?.label ?? null)}`);
  });
  console.log(`  ${image.length} image cards, one per labelled part\n`);

  // 🔴 THE SAME DEDUPE THE DELIVERABLE APPLIES. A written card whose whole answer is a part the
  // image cards cover is that image card inverted; the prompt asks the model to avoid it and a live
  // run showed the model does not always manage it.
  const labels = figure.boxes.map((box) => box.label ?? "");
  const kept = dropCardsCoveredByFigure(written, labels);
  if (kept.length !== written.length) {
    const gone = written.filter((card) => !kept.includes(card));
    console.log(`\n== DROPPED, because the picture already asks it ==`);
    for (const card of gone) console.log(`  - ${card.front}`);
  }

  const rows = [
    ...kept.map((card) => ({ ...card, card_type: hasCloze(card.front) ? "cloze" : "basic", payload: null })),
    ...image.map((card) => ({ ...card, card_type: "image_occlusion" })),
  ];
  const count = (kind: string) => rows.filter((row) => row.card_type === kind).length;
  console.log(`== THE DECK AS IT WOULD BE STORED ==`);
  console.log(`basic ${count("basic")} | cloze ${count("cloze")} | image_occlusion ${count("image_occlusion")} | total ${rows.length}`);

  writeFileSync("/private/tmp/claude-501/-Users-axelgalvez-Desktop-nemesis/9e5f421c-5ed6-41b9-b92d-735905a3a977/scratchpad/deck-rows.json", JSON.stringify(rows, null, 1));
  console.log("rows written to scratchpad/deck-rows.json");
}

import { writeFileSync } from "node:fs";
void main();
