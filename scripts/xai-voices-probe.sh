#!/usr/bin/env bash
#
# Which voice ids does xAI's TTS actually accept?
#
# 🔴 THIS EXISTS BECAUSE THERE IS NO CATALOGUE TO READ. `GET https://api.x.ai/v1/voices` returns 404
# on our key, and no public documentation lists the ids. A guessed `voice_id` is not a cosmetic
# error: the provider answers an unknown one with a 502, which reads to a learner as voice mode
# being broken. So the set is MEASURED.
#
# 🔴 THE LAST THREE CANDIDATES ARE THE CALIBRATION, NOT PADDING. `zzzznotavoice` must fail, or this
# script cannot distinguish an accepted id from a rejected one and every row it prints is worthless.
# `ani` and `thomas` are plausible-sounding names that also fail, which is the evidence that the
# passes are real rather than the provider accepting anything.
#
# Run from apps/web with the environment loaded:
#   set -a && . ./.env.local && set +a && bash ../../scripts/xai-voices-probe.sh
#
# Last run 2026-08-20: eve, ara, rex, gork, sal and leo returned audio; ani, thomas and the control
# returned 502. Re-run before adding a voice to the client's list.

set -e
EMAIL="voice+$(uuidgen)@nemesis.test"
PASS="Pb!$(uuidgen)Aa1"
SVC="${SUPABASE_SERVICE_ROLE_KEY}"
URL="${NEXT_PUBLIC_SUPABASE_URL}"
ANON="${NEXT_PUBLIC_SUPABASE_ANON_KEY}"
UID_JSON=$(curl -s -X POST "$URL/auth/v1/admin/users" -H "apikey: $SVC" -H "Authorization: Bearer $SVC" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"email_confirm\":true}")
USERID=$(echo "$UID_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')
curl -s -X POST "$URL/rest/v1/subscriptions" -H "apikey: $SVC" -H "Authorization: Bearer $SVC" -H "Content-Type: application/json" -d "{\"user_id\":\"$USERID\",\"plan\":\"pro\",\"status\":\"active\",\"billing_provider\":\"stripe\"}" > /dev/null
TOK=$(curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')
for V in eve ara rex gork sal leo ani thomas zzzznotavoice; do
  CODE=$(curl -s -o /tmp/v.out -w "%{http_code}" -X POST "$URL/functions/v1/nemesis-speak" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d "{\"text\":\"Hi.\",\"voice\":\"$V\"}")
  SIZE=$(wc -c < /tmp/v.out | tr -d ' ')
  printf "%-16s %s  %s bytes\n" "$V" "$CODE" "$SIZE"
done
curl -s -X DELETE "$URL/auth/v1/admin/users/$USERID" -H "apikey: $SVC" -H "Authorization: Bearer $SVC" > /dev/null
