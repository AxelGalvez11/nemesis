import assert from "node:assert/strict";
import test from "node:test";

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

async function legacyApkg(): Promise<Uint8Array> {
  const SQL = await enginePromise;
  const bytes = buildDb(
    SQL,
    `
    create table col (decks text);
    insert into col values ('{"1":{"name":"Default"},"1001":{"name":"Pharm::Cardio"}}');
    create table notes (id integer, flds text, tags text);
    create table cards (nid integer, did integer, ord integer);
    insert into notes values
      (1, '<b>Metoprolol</b><br>Class?${U}Beta&nbsp;blocker &amp; antihypertensive <img src="x.jpg"> [sound:beep.mp3]', ' cardio  pharm '),
      (2, '{{c1::Lisinopril}} causes dry cough${U}Because bradykinin builds up', ''),
      (3, 'Warfarin${U}Vitamin K antagonist', ''),
      (4, '<br>${U}back only', ''),
      (5, 'orphan note${U}never carded', '');
    insert into cards values
      (1, 1001, 0),
      (2, 1001, 0),
      (3, 1, 0),
      (3, 1, 1),
      (4, 1001, 0);
    `,
  );
  return zipSync({ "collection.anki2": bytes, media: strToU8('{"0":"beep.mp3"}') });
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
    create table cards (nid integer, did integer, ord integer);
    insert into notes values (10, 'Albuterol${U}Short-acting beta-2 agonist', 'respiratory');
    insert into cards values (10, 1002, 0);
    `,
  );
  const result = parseAnkiPackage(zipSync({ "collection.anki21": bytes }), SQL);
  assert.deepEqual(result.decks.map((deck) => deck.name), ["Pharm::Respiratory"]);
  assert.equal(result.decks[0]?.cards[0]?.front, "Albuterol");
  assert.equal(result.mediaCount, 0);
});

test("junk input fails with a friendly message", async () => {
  const SQL = await enginePromise;
  assert.throws(() => parseAnkiPackage(strToU8("not a zip at all"), SQL), /doesn't look like an Anki deck export/);
  const emptyZip = zipSync({ "readme.txt": strToU8("hello") });
  assert.throws(() => parseAnkiPackage(emptyZip, SQL), /doesn't look like an Anki deck export/);
});
