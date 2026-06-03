#!/usr/bin/env bash
# Phase 1 — openFDA corpus validation gate (LOCAL).
#
# Ingests ~10 seed drugs through the real core-source-sync edge-function
# entrypoint (the same path pg_cron/admin will use), then:
#   1. cross-entity retrieval check (scripts/validate-openfda.ts) — right drug wins
#   2. supersession check — unchanged re-ingest skips; mutated content_hash
#      wipes + re-embeds (content_hash change detection, persist.ts)
#
# Prereqs: local stack up (`supabase start`), core-source-sync served:
#   supabase functions serve core-source-sync --env-file supabase/functions/.env --no-verify-jwt
#
# Usage: scripts/phase1-validate.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# --- local creds (well-known demo keys) + URLs ---
eval "$(supabase status -o env | grep -E '^(SERVICE_ROLE_KEY|API_URL|DB_URL)=')"
export SB_URL="${API_URL}"
export SERVICE_KEY="${SERVICE_ROLE_KEY}"

# --- embedding key from gitignored env (never printed) ---
while IFS='=' read -r k v; do
  case "$k" in VOYAGE_API_KEY|OPENFDA_API_KEY) export "$k=$v" ;; esac
done < supabase/functions/.env
[ -n "${VOYAGE_API_KEY:-}" ] || { echo "VOYAGE_API_KEY missing from supabase/functions/.env"; exit 2; }

FN="${SB_URL}/functions/v1/core-source-sync"
REST="${SB_URL}/rest/v1"
auth=(-H "Authorization: Bearer ${SERVICE_KEY}" -H "apikey: ${SERVICE_KEY}")

DRUGS=(lisinopril metformin atorvastatin semaglutide warfarin amoxicillin sertraline omeprazole amlodipine levothyroxine)

echo "=== Ingesting ${#DRUGS[@]} seed drugs via openFDA (limit 1 label each) ==="
for d in "${DRUGS[@]}"; do
  res=$(curl -s -X POST "$FN" "${auth[@]}" -H "Content-Type: application/json" \
    -d "{\"provider\":\"openfda\",\"opts\":{\"query\":\"openfda.generic_name:${d}\",\"limit\":1}}")
  echo "  ${d}: ${res}"
done

echo
echo "=== Corpus summary ==="
curl -s "${REST}/core_sources?select=provider,title&order=title" "${auth[@]}" \
  | deno eval 'const r=JSON.parse(await new Response(Deno.stdin.readable).text()); console.log(`core_sources: ${r.length}`); r.forEach((x:any)=>console.log(`  [${x.provider}] ${x.title}`));' 2>/dev/null \
  || curl -s "${REST}/core_sources?select=provider,title&order=title" "${auth[@]}"
chunks=$(curl -s "${REST}/core_source_chunks?select=id" "${auth[@]}" -H "Prefer: count=exact" -I | grep -i content-range || true)
echo "chunks content-range: ${chunks}"

echo
echo "=== Cross-entity retrieval check (right drug ranks #1) ==="
deno run --allow-net --allow-env --allow-write scripts/validate-openfda.ts "${DRUGS[@]}"

echo
echo "=== Supersession check (content_hash change detection) ==="
SUP_DRUG="lisinopril"
echo "-- re-ingest ${SUP_DRUG} UNCHANGED → expect skipped_unchanged=1"
curl -s -X POST "$FN" "${auth[@]}" -H "Content-Type: application/json" \
  -d "{\"provider\":\"openfda\",\"opts\":{\"query\":\"openfda.generic_name:${SUP_DRUG}\",\"limit\":1}}"
echo
echo "-- mutate stored content_hash, re-ingest → expect ingested=1 + chunks re-embedded"
curl -s -X PATCH "${REST}/core_sources?provider=eq.openfda&title=ilike.*${SUP_DRUG}*" \
  "${auth[@]}" -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"content_hash":"deadbeefdeadbeefdeadbeefdeadbeef"}'
curl -s -X POST "$FN" "${auth[@]}" -H "Content-Type: application/json" \
  -d "{\"provider\":\"openfda\",\"opts\":{\"query\":\"openfda.generic_name:${SUP_DRUG}\",\"limit\":1}}"
echo
echo "=== DONE ==="
