"""
Fetch the SOURCE PDFs for the sampled PubTables-1M tables from PubMed Central OA.

🔴 THE BENCHMARK SHIPS CROPPED TABLE IMAGES, AND NEMESIS CANNOT READ AN IMAGE.
Its parser reads a PDF's native text runs and its vector rulings; neither exists
in a JPEG. Evaluating the real parser therefore means recovering the real
documents, which is possible because PubTables-1M is built from PMC Open Access
and the filenames carry the PMC id.

🔴 ATTRITION IS REPORTED, NOT ABSORBED. Some OA records ship only .nxml with no
PDF, some are withdrawn, some fail. A sample that silently shrinks is a sample
nobody can reproduce, so every id that does not arrive is written out with its
reason and the totals appear in the report.

Each article package is deleted immediately after its PDF is extracted — disk is
the binding constraint here, not bandwidth.
"""
import json
import os
import shutil
import subprocess
import sys
import tarfile
import time
import threading
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sample_path, out_dir, log_path = sys.argv[1:4]
os.makedirs(out_dir, exist_ok=True)

# 🔴 EUROPE PMC, BECAUSE NCBI'S OWN OA PACKAGES ARE FTP-ONLY. `oa.fcgi` answers with an
# `ftp://` URL and the matching `https://ftp.ncbi.nlm.nih.gov/...` path 404s for every id
# tried; the article-page PDF route returns an HTML interstitial rather than a document.
# Europe PMC mirrors the same Open Access corpus and serves the PDF directly. Verified:
# PMC2268688 -> 200 application/pdf, 272 KB.
PDF_URL = "https://europepmc.org/articles/{pmc}?pdf=render"
# A courtesy identifier: automated clients should say who they are.
UA = {"User-Agent": "nemesis-parser-benchmark/1.0 (research; parser evaluation)"}
MAX_PDF = 60 * 1024 * 1024          # one article should never need more than this


class Throttle:
    """At most one request every `gap` seconds, across every worker."""

    def __init__(self, gap: float) -> None:
        self.gap = gap
        self.lock = threading.Lock()
        self.last = 0.0

    def __enter__(self):
        with self.lock:
            wait = self.gap - (time.monotonic() - self.last)
            if wait > 0:
                time.sleep(wait)
            self.last = time.monotonic()
        return self

    def __exit__(self, *_):
        return False


LIMIT = Throttle(1.2)


def fetch(rec: dict) -> dict:
    pmc = rec["pmc"]
    dest = os.path.join(out_dir, f"{pmc}.pdf")
    if os.path.exists(dest) and os.path.getsize(dest) > 1024:
        return {"id": rec["id"], "ok": True, "reason": "cached"}
    # 🔴 ONE AT A TIME WITH BACKOFF. Three concurrent workers earned HTTP 429 on 332 of 360
    # requests — a public mirror throttles, and hammering it would both fail and be rude. The
    # sample is a few hundred documents, so patience costs minutes and buys the whole sample.
    for attempt in range(5):
        try:
            with LIMIT:
                req = urllib.request.Request(PDF_URL.format(pmc=pmc), headers=UA)
                r = urllib.request.urlopen(req, timeout=120)
            break
        except urllib.error.HTTPError as exc:
            if exc.code != 429 or attempt == 4:
                return {"id": rec["id"], "ok": False, "reason": f"HTTP {exc.code}"}
            time.sleep(2 ** attempt * 3)
        except Exception as exc:                  # noqa: BLE001
            if attempt == 4:
                return {"id": rec["id"], "ok": False, "reason": type(exc).__name__ + ": " + str(exc)[:50]}
            time.sleep(2 ** attempt * 2)
    else:
        return {"id": rec["id"], "ok": False, "reason": "retries-exhausted"}

    try:
        with r:
            ctype = r.headers.get("Content-Type", "")
            if "pdf" not in ctype.lower():
                return {"id": rec["id"], "ok": False, "reason": f"not-a-pdf ({ctype[:30]})"}
            read = 0
            with open(dest, "wb") as f:
                while chunk := r.read(1 << 16):
                    read += len(chunk)
                    if read > MAX_PDF:
                        f.close()
                        os.remove(dest)
                        return {"id": rec["id"], "ok": False, "reason": "pdf-too-large"}
                    f.write(chunk)
        # A PDF starts with %PDF-; anything else is an error page with the wrong label.
        with open(dest, "rb") as f:
            if not f.read(5).startswith(b"%PDF"):
                os.remove(dest)
                return {"id": rec["id"], "ok": False, "reason": "not-pdf-magic"}
        return {"id": rec["id"], "ok": True, "reason": "fetched"}
    except Exception as exc:                      # noqa: BLE001 — every failure is a datum
        if os.path.exists(dest):
            os.remove(dest)
        return {"id": rec["id"], "ok": False, "reason": type(exc).__name__ + ": " + str(exc)[:60]}


records = [json.loads(l) for l in open(sample_path)]
results = []
# Two workers, but the throttle above is what actually paces this.
with ThreadPoolExecutor(max_workers=2) as pool:
    for i, res in enumerate(pool.map(fetch, records), 1):
        results.append(res)
        if i % 40 == 0:
            ok = sum(1 for r in results if r["ok"])
            print(f"  … {i}/{len(records)}  ok {ok}", flush=True)

with open(log_path, "w") as f:
    for r in results:
        f.write(json.dumps(r) + "\n")

ok = sum(1 for r in results if r["ok"])
from collections import Counter
print(f"\nfetched {ok}/{len(records)} source PDFs")
print("attrition:", dict(Counter(r["reason"] for r in results if not r["ok"])))
