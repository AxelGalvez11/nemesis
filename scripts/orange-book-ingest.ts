#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --allow-run
/**
 * FDA Orange Book companion ingest script.
 *
 * The edge function can't download + unzip + join ~70k rows in its 60s
 * budget, so this host-side script does the heavy lifting (mirrors the
 * drugs-fda.ts / openfda-bulk.ts pattern) and POSTs pre-aggregated
 * per-ingredient records to core-source-sync with skip_embed:true.
 *
 * Parses the `~`-delimited Orange Book files:
 *   products.txt · patent.txt · exclusivity.txt
 * joins patents/exclusivity to products by (Appl_No, Product_No), and
 * aggregates by active ingredient.
 *
 * Usage:
 *   SERVICE_KEY=... deno run -A scripts/orange-book-ingest.ts \
 *     [--dir=/path/to/unzipped] [--url=http://127.0.0.1:54321] \
 *     [--ingredients=atorvastatin,metformin] [--limit=N] [--dry-run]
 *
 * With no --dir, downloads + unzips the current EOBZIP archive.
 */

import type {
  OrangeBookExclusivity,
  OrangeBookPatent,
  OrangeBookProduct,
  OrangeBookRecord,
} from "../supabase/functions/core-source-sync/providers/orange-book.ts";

const OB_DOWNLOAD_URL = "https://www.fda.gov/media/76860/download";
const BATCH = 50;

function arg(name: string): string | undefined {
  const hit = Deno.args.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}
const hasFlag = (name: string) => Deno.args.includes(`--${name}`);

const SB_URL = arg("url") ?? Deno.env.get("SB_URL") ?? "http://127.0.0.1:54321";
const SERVICE_KEY = Deno.env.get("SERVICE_KEY") ?? arg("service-key");
const DRY_RUN = hasFlag("dry-run");
const LIMIT = arg("limit") ? Number(arg("limit")) : undefined;
const FILTER = (arg("ingredients") ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function splitRows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.length > 0)
    .map((l) => l.split("~"));
}

const yes = (v: string | undefined) => (v ?? "").trim().toLowerCase() === "yes";
const flag = (v: string | undefined) => (v ?? "").trim().toUpperCase() === "Y";
const clean = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t.length ? t : undefined;
};

async function loadDir(): Promise<string> {
  const dir = arg("dir");
  if (dir) return dir;
  // download + unzip
  const tmp = await Deno.makeTempDir({ prefix: "orange-book-" });
  console.error(`Downloading Orange Book archive → ${tmp}/ob.zip`);
  const res = await fetch(OB_DOWNLOAD_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (PharmaBro corpus ingest)" },
  });
  if (!res.ok) throw new Error(`Orange Book download ${res.status}`);
  await Deno.writeFile(`${tmp}/ob.zip`, new Uint8Array(await res.arrayBuffer()));
  const unzip = new Deno.Command("unzip", {
    args: ["-o", "-q", `${tmp}/ob.zip`, "-d", tmp],
  });
  const { success, stderr } = await unzip.output();
  if (!success) {
    throw new Error(`unzip failed: ${new TextDecoder().decode(stderr)}`);
  }
  return tmp;
}

function parseProducts(rows: string[][]): OrangeBookProduct[] {
  // Ingredient~DF;Route~Trade_Name~Applicant~Strength~Appl_Type~Appl_No~
  // Product_No~TE_Code~Approval_Date~RLD~RS~Type~Applicant_Full_Name
  return rows.slice(1).map((r) => ({
    _ingredient: (r[0] ?? "").trim(),
    df_route: (r[1] ?? "").trim(),
    trade_name: (r[2] ?? "").trim(),
    applicant: (r[3] ?? "").trim(),
    strength: (r[4] ?? "").trim(),
    appl_type: (r[5] ?? "").trim(),
    appl_no: (r[6] ?? "").trim(),
    product_no: (r[7] ?? "").trim(),
    te_code: clean(r[8]),
    approval_date: clean(r[9]),
    rld: yes(r[10]),
    rs: yes(r[11]),
    market_type: (r[12] ?? "").trim(),
    applicant_full_name: clean(r[13]),
  })) as unknown as Array<OrangeBookProduct & { _ingredient: string }>;
}

function parsePatents(rows: string[][]): OrangeBookPatent[] {
  // Appl_Type~Appl_No~Product_No~Patent_No~Patent_Expire_Date_Text~
  // Drug_Substance_Flag~Drug_Product_Flag~Patent_Use_Code~Delist_Flag~Submission_Date
  return rows.slice(1).map((r) => ({
    appl_no: (r[1] ?? "").trim(),
    product_no: (r[2] ?? "").trim(),
    patent_no: (r[3] ?? "").trim(),
    patent_expire_date: clean(r[4]),
    drug_substance: flag(r[5]),
    drug_product: flag(r[6]),
    patent_use_code: clean(r[7]),
    delisted: flag(r[8]),
  }));
}

function parseExclusivity(rows: string[][]): OrangeBookExclusivity[] {
  // Appl_Type~Appl_No~Product_No~Exclusivity_Code~Exclusivity_Date
  return rows.slice(1).map((r) => ({
    appl_no: (r[1] ?? "").trim(),
    product_no: (r[2] ?? "").trim(),
    exclusivity_code: (r[3] ?? "").trim(),
    exclusivity_date: clean(r[4]),
  }));
}

async function main() {
  const dir = await loadDir();
  const [prodTxt, patTxt, exclTxt] = await Promise.all([
    Deno.readTextFile(`${dir}/products.txt`),
    Deno.readTextFile(`${dir}/patent.txt`),
    Deno.readTextFile(`${dir}/exclusivity.txt`),
  ]);

  const products = parseProducts(splitRows(prodTxt)) as Array<
    OrangeBookProduct & { _ingredient: string }
  >;
  const patents = parsePatents(splitRows(patTxt));
  const exclusivity = parseExclusivity(splitRows(exclTxt));
  console.error(
    `parsed: ${products.length} products, ${patents.length} patents, ${exclusivity.length} exclusivity`,
  );

  // (appl_no/product_no) → ingredient, to attach patents + exclusivity.
  const keyToIngredient = new Map<string, string>();
  for (const p of products) {
    keyToIngredient.set(`${p.appl_no}/${p.product_no}`, p._ingredient);
  }

  const byIngredient = new Map<string, OrangeBookRecord>();
  const ensure = (ingredient: string): OrangeBookRecord => {
    let rec = byIngredient.get(ingredient);
    if (!rec) {
      rec = { ingredient, products: [], patents: [], exclusivity: [] };
      byIngredient.set(ingredient, rec);
    }
    return rec;
  };

  for (const p of products) {
    const { _ingredient, ...prod } = p;
    (ensure(_ingredient).products as OrangeBookProduct[]).push(prod);
  }
  for (const pt of patents) {
    const ing = keyToIngredient.get(`${pt.appl_no}/${pt.product_no}`);
    if (ing) (ensure(ing).patents as OrangeBookPatent[]).push(pt);
  }
  for (const ex of exclusivity) {
    const ing = keyToIngredient.get(`${ex.appl_no}/${ex.product_no}`);
    if (ing) (ensure(ing).exclusivity as OrangeBookExclusivity[]).push(ex);
  }

  let records = [...byIngredient.values()];
  if (FILTER.length) {
    records = records.filter((r) =>
      FILTER.some((f) => r.ingredient.toLowerCase().includes(f))
    );
  }
  records.sort((a, b) => a.ingredient.localeCompare(b.ingredient));
  if (LIMIT) records = records.slice(0, LIMIT);

  console.error(
    `${byIngredient.size} ingredients total; ${records.length} selected${
      FILTER.length ? ` (filter: ${FILTER.join(",")})` : ""
    }`,
  );

  if (DRY_RUN) {
    for (const r of records.slice(0, 20)) {
      const te = [...new Set(r.products.map((p) => p.te_code).filter(Boolean))];
      console.log(
        `  ${r.ingredient}: ${r.products.length} products, generic=${
          r.products.some((p) => p.appl_type === "A")
        }, TE=${te.join("/") || "-"}, patents=${r.patents.length}, excl=${r.exclusivity.length}`,
      );
    }
    return;
  }

  if (!SERVICE_KEY) {
    console.error("SERVICE_KEY required to POST (or use --dry-run)");
    Deno.exit(2);
  }

  let ingested = 0;
  const errors: unknown[] = [];
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const res = await fetch(`${SB_URL}/functions/v1/core-source-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        provider: "fda_orange_book",
        opts: { pre_parsed: batch },
        skip_embed: true,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      errors.push({ status: res.status, body });
      console.error(`batch ${i / BATCH} failed: ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
    } else {
      ingested += body.ingested ?? 0;
      console.error(
        `batch ${i / BATCH}: ingested=${body.ingested} skipped=${body.skipped_unchanged} chunks=${body.chunk_count}`,
      );
    }
  }
  console.log(
    `DONE — ingested ${ingested}/${records.length} ingredients, ${errors.length} batch errors`,
  );
  if (errors.length) Deno.exit(1);
}

await main();
