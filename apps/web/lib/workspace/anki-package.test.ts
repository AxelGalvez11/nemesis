import assert from "node:assert/strict";
import test from "node:test";
import * as zlib from "node:zlib";

import { strToU8, zipSync } from "fflate";
import initSqlJs from "sql.js";

import { parseAnkiPackage } from "./anki-package";

const U = "\u001f";
const enginePromise = initSqlJs();

function buildDb(SQL: Awaited<typeof enginePromise>, statements: string): Uint8Array {
  const db = new SQL.Database();
  db.exec(statements);
  const bytes = db.export();
  db.close();
  return bytes;
}

/** Anki's newest exports zstd-compress the collection; fzstd only decodes, so
 *  the fixture compresses with Node's zlib to produce a genuine .anki21b.
 *  (Runtime has zstdCompressSync since Node 22.15; @types/node here predates it.) */
const zstdCompressSync = (zlib as unknown as { zstdCompressSync: (data: Uint8Array) => Buffer }).zstdCompressSync;
function zstdCompress(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(zstdCompressSync(bytes));
}

async function legacyApkgDb(): Promise<Uint8Array> {
  const SQL = await enginePromise;
  return buildDb(
    SQL,
    `
    create table col (decks text);
    insert into col values ('{"1":{"name":"Default"},"1001":{"name":"Pharm::Cardio"}}');
    create table notes (id integer, flds text, tags text);
    create table cards (nid integer, did integer, ord integer, queue integer, flags integer);
    insert into notes values
      (1, '<b>Metoprolol</b><br>Class?${U}Beta&nbsp;blocker &amp; antihypertensive <img src="x.jpg"> [sound:beep.mp3]', ' cardio  pharm '),
      (2, '{{c1::Lisinopril}} causes dry cough${U}Because bradykinin builds up', ''),
      (3, 'Warfarin${U}Vitamin K antagonist', ''),
      (4, '<br>${U}back only', ''),
      (5, 'orphan note${U}never carded', '');
    insert into cards values
      (1, 1001, 0, 0, 0),
      (2, 1001, 0, 0, 1),
      (3, 1, 0, -1, 0),
      (3, 1, 1, -1, 0),
      (4, 1001, 0, 0, 0);
    `,
  );
}

async function legacyApkg(): Promise<Uint8Array> {
  return zipSync({ "collection.anki2": await legacyApkgDb(), media: strToU8('{"0":"beep.mp3"}') });
}

test("legacy .apkg parses into decks of typed cards", async () => {
  const SQL = await enginePromise;
  const result = parseAnkiPackage(await legacyApkg(), SQL);

  assert.deepEqual(result.decks.map((deck) => deck.name), ["Default", "Pharm::Cardio"]);
  assert.equal(result.cardCount, 3);
  assert.equal(result.skippedNotes, 2);
  assert.equal(result.mediaCount, 1);

  const cardio = result.decks[1];
  assert.equal(cardio?.cards.length, 2);
  const basic = cardio?.cards[0];
  assert.equal(basic?.front, "**Metoprolol**\nClass?");
  assert.equal(basic?.back, "Beta blocker & antihypertensive");
  assert.equal(basic?.cardType, "basic");
  assert.deepEqual(basic?.tags, ["cardio", "pharm"]);
  assert.equal(cardio?.cards[1]?.cardType, "cloze");

  const reversed = result.decks[0]?.cards[0];
  assert.equal(reversed?.cardType, "reversed");
  assert.equal(reversed?.front, "Warfarin");
});

test("new-schema exports read the decks table and its separators", async () => {
  const SQL = await enginePromise;
  const bytes = buildDb(
    SQL,
    `
    create table decks (id integer, name text);
    insert into decks values (1, 'Default'), (1002, 'Pharm' || char(31) || 'Respiratory');
    create table notes (id integer, flds text, tags text);
    create table cards (nid integer, did integer, ord integer, queue integer, flags integer);
    insert into notes values (10, 'Albuterol${U}Short-acting beta-2 agonist', 'respiratory');
    insert into cards values (10, 1002, 0, 0, 0);
    `,
  );
  const result = parseAnkiPackage(zipSync({ "collection.anki21": bytes }), SQL);
  assert.deepEqual(result.decks.map((deck) => deck.name), ["Pharm::Respiratory"]);
  assert.equal(result.decks[0]?.cards[0]?.front, "Albuterol");
  assert.equal(result.mediaCount, 0);
});

test("the modern zstd database wins over a legacy upgrade-stub", async () => {
  // Real Anki exports (e.g. the Captain Hook deck) ship collection.anki21b
  // WITH a one-card collection.anki2 stub telling old clients to upgrade.
  // Reading the stub would import 1 junk card instead of the whole deck.
  const SQL = await enginePromise;
  const stub = buildDb(
    SQL,
    `
    create table col (decks text);
    insert into col values ('{"1":{"name":"Default"}}');
    create table notes (id integer, flds text, tags text);
    create table cards (nid integer, did integer, ord integer, queue integer, flags integer);
    insert into notes values (1, 'Please update to the latest Anki version, then import the .colpkg/.apkg file again.${U}', '');
    insert into cards values (1, 1, 0, 0, 0);
    `,
  );
  const real = buildDb(
    SQL,
    `
    create table decks (id integer, name text);
    insert into decks values (5, 'MCAT::Biochem');
    create table notes (id integer, flds text, tags text);
    create table cards (nid integer, did integer, ord integer, queue integer, flags integer);
    insert into notes values (7, 'What is the electron transport chain?${U}Enzymes in the inner mitochondrial membrane', 'biochem');
    insert into cards values (7, 5, 0, 0, 0);
    `,
  );
  const result = parseAnkiPackage(zipSync({ "collection.anki2": stub, "collection.anki21b": zstdCompress(real) }), SQL);
  assert.deepEqual(result.decks.map((deck) => deck.name), ["MCAT::Biochem"]);
  assert.equal(result.cardCount, 1);
  assert.equal(result.decks[0]?.cards[0]?.front, "What is the electron transport chain?");

  // A stub with no modern sibling is itself the "re-export" signal.
  assert.throws(() => parseAnkiPackage(zipSync({ "collection.anki2": stub }), SQL), /newest format/);
});

test("media entries are counted without being inflated", async () => {
  const SQL = await enginePromise;
  const files: Record<string, Uint8Array> = { "collection.anki2": (await legacyApkgDb()) };
  for (let index = 0; index < 12; index += 1) files[String(index)] = new Uint8Array(64);
  const result = parseAnkiPackage(zipSync(files), SQL);
  assert.equal(result.mediaCount, 12);
});

test("junk input fails with a friendly message", async () => {
  const SQL = await enginePromise;
  assert.throws(() => parseAnkiPackage(strToU8("not a zip at all"), SQL), /doesn't look like an Anki deck export/);
  const emptyZip = zipSync({ "readme.txt": strToU8("hello") });
  assert.throws(() => parseAnkiPackage(emptyZip, SQL), /doesn't look like an Anki deck export/);
});

// The AnKing footgun: a shared deck ships almost entirely suspended and the
// student unsuspends lecture by lecture. Importing it all as active would bury
// them under tens of thousands of due cards on day one.
test("a suspended note arrives suspended, and a flagged one keeps its colour", async () => {
  const SQL = await enginePromise;
  const result = parseAnkiPackage(await legacyApkg(), SQL);
  const cards = result.decks.flatMap((deck) => deck.cards);

  const warfarin = cards.find((card) => card.front === "Warfarin");
  assert.equal(warfarin?.suspended, true, "both of its cards had queue -1");
  assert.equal(result.suspendedCount, 1);

  const lisinopril = cards.find((card) => card.front.includes("Lisinopril"));
  assert.equal(lisinopril?.flag, 1, "flags & 7 == 1 is Anki's red");
  assert.equal(lisinopril?.suspended, false);
});
