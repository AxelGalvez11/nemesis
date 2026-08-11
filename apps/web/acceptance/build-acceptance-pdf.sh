#!/usr/bin/env bash
# Render the golden acceptance source to a real PDF.
#
# 🔴 A UNIQUE REVISION MARKER PER BUILD, AND IT IS LOAD-BEARING. Ingestion keys on the file's
# content hash (`library_sources.content_hash`), so re-uploading byte-identical bytes would be
# answered from the existing parse instead of exercising the parser. Stamping a revision into the
# page changes the hash, which is what makes each acceptance run a genuine end-to-end test rather
# than a cache read.
#
# Chrome rather than a text-to-PDF converter on purpose: it emits real vector text and a REAL
# RULED TABLE. A table drawn as spaced-out words would not test whether tables survive parsing,
# which is one of the two things this document exists to prove.
#
#   ./build-acceptance-pdf.sh [revision]   ->   acceptance-course-<revision>.pdf

set -euo pipefail
cd "$(dirname "$0")"

REVISION="${1:-$(date -u +%Y%m%dT%H%M%S)}"
OUT="acceptance-course-${REVISION}.pdf"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

sed "s|<!--REVISION-->|${REVISION}|" acceptance-course.html > "$TMP/source.html"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME" >&2; exit 1; }

"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$TMP/out.pdf" "file://$TMP/source.html" >/dev/null 2>&1

mv "$TMP/out.pdf" "$OUT"
echo "$OUT  ($(wc -c < "$OUT" | tr -d ' ') bytes, revision ${REVISION})"
