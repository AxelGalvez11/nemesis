#!/usr/bin/env -S deno run --allow-net --allow-env
/**
 * Phase 5 — weekly digest generator (the `weekly_digest` job, run by hand here;
 * pg_cron scheduling + Resend email delivery are documented carry-forward).
 *
 * For each user with a `weekly` watchlist item: match `updates` to their follows
 * on the LOCKED (item_type, item_ref) seam, keep those whose detected_at falls in
 * the digest window, join evidence_scores for the doc-12 `evidence_quality` key,
 * rank + dedupe with the PURE comparator (packages/shared/digest-ranking), and
 * upsert one `digests` snapshot per (user, period). The snapshot is reproducible:
 * it stores the ranked items as they were, not a live re-query.
 *
 * Window: [period_start, period_end). Defaults to the last --window-days (7), but
 * the validator passes explicit bounds so the just-emitted updates fall inside and
 * the run is byte-deterministic. Idempotent: re-running the same bounds upserts
 * the same row (ON CONFLICT (user_id,period_start,period_end) DO UPDATE).
 *
 * Usage:
 *   SB_URL=https://<ref>.supabase.co SERVICE_KEY=... \
 *     deno run --allow-net --allow-env scripts/generate-digest.ts \
 *       [--user=<uuid>] [--window-days=7] \
 *       [--period-start=ISO --period-end=ISO] [--dry-run]
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { rankDigest, type DigestCandidate } from "../packages/shared/src/digest-ranking.ts";
import type { EvidenceTier } from "../packages/shared/src/evidence.ts";
import type { UpdateType, WatchItemType } from "../packages/shared/src/watchlist.ts";

const SB_URL = Deno.env.get("SB_URL");
const SERVICE_KEY = Deno.env.get("SERVICE_KEY");
if (!SB_URL || !SERVICE_KEY) {
  console.error("SB_URL + SERVICE_KEY required");
  Deno.exit(2);
}
const sb = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false } });

const flag = (n: string) => Deno.args.includes(`--${n}`);
const arg = (n: string): string | undefined =>
  Deno.args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const ONLY_USER = arg("user");
const WINDOW_DAYS = arg("window-days") ? Number(arg("window-days")) : 7;
const DRY_RUN = flag("dry-run");

const VERSION = "digest-engine-1.0.0";

// §9 tier → ordinal rank (mirrors scripts/phase4-validate.ts RANK). Drives the
// doc-12 evidence_quality key; unknown / unscored is the conservative floor.
const RANK: Record<EvidenceTier, number> = {
  unknown: -1, very_weak: 0, weak: 1, moderate: 2, strong: 3, very_strong: 4,
};

async function loadAll<T>(table: string, select: string): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb.from(table).select(select).range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < page) break;
  }
  return out;
}

interface WatchRow { user_id: string; item_type: WatchItemType; item_ref: string }
interface UpdateRow {
  id: string; item_type: WatchItemType; item_ref: string; update_type: UpdateType;
  title: string; summary: string | null; source_id: string | null;
  source_url: string | null; importance_score: number | null; detected_at: string;
}

async function main() {
  const now = new Date().toISOString();
  const periodEnd = arg("period-end") ?? now;
  const periodStart = arg("period-start") ??
    new Date(Date.parse(periodEnd) - WINDOW_DAYS * 86_400_000).toISOString();
  console.log(`Digest window: [${periodStart}, ${periodEnd})  (weekly frequency)`);

  // Weekly followers (instant/daily deferred — carry-forward).
  let wq = sb.from("watchlist_items")
    .select("user_id,item_type,item_ref")
    .eq("frequency", "weekly");
  if (ONLY_USER) wq = wq.eq("user_id", ONLY_USER);
  const { data: watchData, error: wErr } = await wq;
  if (wErr) throw new Error(`watchlist_items: ${wErr.message}`);
  const watches = (watchData ?? []) as WatchRow[];

  if (!watches.length) {
    console.log("No weekly watchlist items in scope — nothing to generate.");
    return;
  }

  // All updates + drug-level evidence tiers, loaded once and matched in memory.
  const updates = await loadAll<UpdateRow>(
    "updates",
    "id,item_type,item_ref,update_type,title,summary,source_id,source_url,importance_score,detected_at",
  );
  const scores = await loadAll<{ entity_id: string; score: EvidenceTier }>(
    "evidence_scores", "entity_id,score",
  );
  const tierByEntity = new Map<string, EvidenceTier>();
  for (const s of scores) if (!tierByEntity.has(s.entity_id)) tierByEntity.set(s.entity_id, s.score);

  // Index updates by the (item_type,item_ref) seam, pre-filtered to the window.
  const inWindow = (d: string) => d >= periodStart && d < periodEnd;
  const updatesByKey = new Map<string, UpdateRow[]>();
  for (const u of updates) {
    if (!inWindow(u.detected_at)) continue;
    const k = `${u.item_type}|${u.item_ref}`;
    (updatesByKey.get(k) ?? updatesByKey.set(k, []).get(k)!).push(u);
  }

  // Group follows by user.
  const followsByUser = new Map<string, WatchRow[]>();
  for (const w of watches) {
    (followsByUser.get(w.user_id) ?? followsByUser.set(w.user_id, []).get(w.user_id)!).push(w);
  }

  let written = 0, emptySkipped = 0;
  for (const [userId, follows] of followsByUser) {
    const candidates: DigestCandidate[] = [];
    const seenUpdate = new Set<string>();
    for (const f of follows) {
      const matched = updatesByKey.get(`${f.item_type}|${f.item_ref}`) ?? [];
      for (const u of matched) {
        if (seenUpdate.has(u.id)) continue; // a user following the same item twice
        seenUpdate.add(u.id);
        candidates.push({
          ...u,
          evidence_rank: RANK[tierByEntity.get(u.item_ref) ?? "unknown"],
        });
      }
    }
    const ranked = rankDigest(candidates);
    if (ranked.length === 0) { emptySkipped++; continue; } // no empty-week rows

    console.log(`  user ${userId.slice(0, 8)}…: ${ranked.length} ranked update(s)`);
    if (DRY_RUN) {
      for (const r of ranked.slice(0, 3)) console.log(`      • [${r.update_type}] ${r.title}`);
      written++;
      continue;
    }
    const { error } = await sb.from("digests").upsert({
      user_id: userId,
      period_start: periodStart,
      period_end: periodEnd,
      items: ranked,
      update_count: ranked.length,
      generated_by_version: VERSION,
      generated_at: now,
    }, { onConflict: "user_id,period_start,period_end" });
    if (error) { console.error(`  upsert ${userId}: ${error.message}`); continue; }
    written++;
  }

  console.log(
    `\n${DRY_RUN ? "[dry-run] " : ""}✅ digest ${VERSION}: ${written} digest(s) ${DRY_RUN ? "would be " : ""}written, ${emptySkipped} user(s) had nothing this window`,
  );
}

main().catch((e) => {
  console.error("fatal:", e.message);
  Deno.exit(1);
});
