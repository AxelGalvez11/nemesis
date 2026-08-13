#!/usr/bin/env bash
# One arm across a list of documents, RESUMABLY.
#
# 🔴 THE RESUME IS THE POINT. Two agent sessions died on a 600-second watchdog
# today. A document whose result file already exists is skipped, so a run killed
# at document 15 continues at 16 instead of paying for 1..15 a second time.
# Each document's own process writes its own file the moment it finishes; nothing
# is held in memory until the end.
#
# Usage (from apps/web):
#   scripts/vision-run.sh <off|stub|live> <upload|worker> <listfile> <outdir>
set -u

ARM="$1"; SHAPE="$2"; LIST="$3"; OUTDIR="$4"
FIGFLAG=""
[ "$SHAPE" = "worker" ] && FIGFLAG="--figures"
mkdir -p "$OUTDIR"

TSX="$(cd "$(dirname "$0")/../../.." && pwd)/node_modules/.bin/tsx"

done_n=0; skipped=0; failed=0
while read -r pdf; do
  [ -z "$pdf" ] && continue
  base="$(basename "$pdf" .pdf)"
  out="$OUTDIR/$base.json"
  if [ -s "$out" ]; then
    skipped=$((skipped + 1))
    continue
  fi
  # One retry, and no more: the cap the owner authorised is 1 retry per document.
  if ! "$TSX" "$(dirname "$0")/vision-arm.mts" "$ARM" "$pdf" $FIGFLAG --out "$out" >/dev/null 2>>"$OUTDIR/stderr.log"; then
    if ! "$TSX" "$(dirname "$0")/vision-arm.mts" "$ARM" "$pdf" $FIGFLAG --out "$out" >/dev/null 2>>"$OUTDIR/stderr.log"; then
      failed=$((failed + 1))
      echo "FAILED $base" >&2
      continue
    fi
  fi
  done_n=$((done_n + 1))
  # Progress on stderr so a watchdog sees the run is alive.
  echo "[$ARM/$SHAPE] $done_n done, $skipped skipped, $failed failed — $base" >&2
done < "$LIST"

echo "{\"arm\":\"$ARM\",\"shape\":\"$SHAPE\",\"parsed\":$done_n,\"skipped\":$skipped,\"failed\":$failed}"
