/**
 * Why the owner's own coursework canvas is dead, and whether its material is recoverable.
 *
 * Run: pnpm --filter @nemesis/web exec tsx scripts/runtime-004-probe.mts
 *
 * `186d0749` "Community IPPE Exam Prep" holds 4 PDFs and 0 durable sources, so the knowledge layer
 * cannot address any of them and the canvas dies before ownership is even consulted. RUNTIME-004
 * asks whether an ephemeral attach is ever correct. Before that can be answered, three facts have
 * to be established rather than assumed:
 *
 *   1. What do those 4 canvas sources actually carry — names, ids, excerpts, any handle at all?
 *   2. Do matching `library_sources` rows EXIST for them? If they do, the material is recoverable
 *      by relinking. If they do not, the bytes were never durably stored and only a re-upload can
 *      help. Those are completely different products and completely different fixes.
 *   3. Is this canvas alone, or is ephemeral attach the normal outcome?
 *
 * READ-ONLY. Prints ids, names, counts and shapes — never a line of anyone's document.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function env(): { url: string; key: string } {
  const path = `${process.env.HOME}/Desktop/AIcodingProjects/nemesis/.env`;
  const raw = readFileSync(path, "utf8");
  const find = (name: string) =>
    raw.split("\n").find((l) => l.startsWith(`${name}=`))?.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") ?? "";
  const url = find("SUPABASE_URL") || find("NEXT_PUBLIC_SUPABASE_URL");
  const key = find("SUPABASE_SERVICE_ROLE_KEY") || find("SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found in .env");
  return { key, url };
}

interface CanvasSourceShape {
  id?: string;
  name?: string;
  title?: string;
  librarySourceId?: string | null;
  durability?: string;
  excerpts?: unknown[];
  parseQuality?: unknown;
  kind?: string;
}

async function main() {
  const { key, url } = env();
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: canvases, error } = await db
    .from("learning_canvases")
    .select("id, user_id, title, state, document, created_at, deleted")
    .eq("deleted", false);
  if (error) throw error;

  console.log("\n═══ 1. EVERY CANVAS: how many of its sources are addressable? ═══\n");
  for (const row of canvases!) {
    const sources = ((row.document as { sources?: CanvasSourceShape[] } | null)?.sources ?? []);
    const durable = sources.filter((s) => s.librarySourceId).length;
    console.log(
      `${String(row.id).slice(0, 8)}  ${String(row.title ?? "(untitled)").slice(0, 34).padEnd(36)} ` +
        `sources=${String(sources.length).padEnd(3)} durable=${String(durable).padEnd(3)} ` +
        `${sources.length > 0 && durable === 0 ? "⛔ DEAD — nothing addressable" : durable === sources.length && sources.length > 0 ? "🟢 all addressable" : sources.length === 0 ? "(empty)" : "🟡 mixed"}`,
    );
  }

  const target = canvases!.find((c) => String(c.id).startsWith("186d0749"));
  if (!target) {
    console.log("\n186d0749 not found.");
    return;
  }

  const userId = String(target.user_id);
  const sources = ((target.document as { sources?: CanvasSourceShape[] } | null)?.sources ?? []);

  console.log(`\n═══ 2. WHAT THE 4 SOURCES ON 186d0749 ACTUALLY CARRY ═══`);
  console.log(`canvas created_at: ${target.created_at}\n`);
  for (const source of sources) {
    console.log(`  · id            : ${source.id ?? "(none)"}`);
    console.log(`    name/title    : ${source.name ?? source.title ?? "(none)"}`);
    console.log(`    kind          : ${source.kind ?? "(none)"}`);
    console.log(`    librarySourceId: ${source.librarySourceId ?? "🔴 NULL — unaddressable"}`);
    console.log(`    durability    : ${source.durability ?? "(unset)"}`);
    console.log(`    excerpts      : ${Array.isArray(source.excerpts) ? source.excerpts.length : 0}  ← content held IN the canvas`);
    console.log(`    parseQuality  : ${source.parseQuality ? JSON.stringify(source.parseQuality).slice(0, 60) : "(none)"}`);
    console.log("");
  }

  console.log(`═══ 3. 🔴 THE DECISIVE QUESTION: do library_sources rows exist for this material? ═══\n`);
  const { data: library, error: libError } = await db
    .from("library_sources")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (libError) throw libError;

  console.log(`The owner has ${library!.length} library_sources rows. Canvas source names against them:\n`);
  const names = sources.map((s) => (s.name ?? s.title ?? "").toLowerCase()).filter(Boolean);
  for (const row of library!) {
    const label = String((row as Record<string,unknown>).file_name ?? "").toLowerCase();
    const hit = names.some((n) => n && label && (label.includes(n) || n.includes(label)));
    console.log(
      `  ${hit ? "🎯 MATCHES A CANVAS SOURCE" : "  "} ${String(row.id).slice(0, 8)}  ` +
        `${String((row as Record<string,unknown>).file_name ?? "(untitled)").slice(0, 44).padEnd(46)} ` +
        `parsed=${row.parsed_document_id ? "yes" : "NO "}  ${String(row.created_at).slice(0, 10)}`,
    );
  }

  console.log(`\n═══ 4. IS THE MATERIAL RECOVERABLE? ═══\n`);
  const anyMatch = library!.some((row) => {
    const label = String((row as Record<string,unknown>).file_name ?? "").toLowerCase();
    return names.some((n) => n && label && (label.includes(n) || n.includes(label)));
  });
  const excerptTotal = sources.reduce((sum, s) => sum + (Array.isArray(s.excerpts) ? s.excerpts.length : 0), 0);
  console.log(`  canvas sources with a name we could match on : ${names.length} of ${sources.length}`);
  console.log(`  any library row matching one of those names  : ${anyMatch ? "🟢 YES — relinkable without re-upload" : "🔴 NO — the bytes are not in the library under a matching name"}`);
  console.log(`  excerpts held inside the canvas document      : ${excerptTotal}  ${excerptTotal > 0 ? "← the TEXT survives even though the source is unaddressable" : "← nothing held locally either"}`);
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
