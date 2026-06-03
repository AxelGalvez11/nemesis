#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
/**
 * Phase 2 — entity-linking: project the Layer-A corpus into the Layer-B catalog.
 *
 * Reads the live core_sources / core_source_chunks (cloud), builds canonical
 * drug_entities, aliases, the drug_entity_sources bridge, and the typed
 * projections (label_documents / clinical_trials / pubmed_articles) with their
 * many-to-many entity links. Seeds drug_classes + memberships from the manifest.
 *
 * DESIGN (per advisor):
 *  - drug_entities keyed by `normalized_name` (UNIQUE) → idempotent + re-runnable
 *    (this script doubles as the Phase-5 refresh runner).
 *  - SEED names (manifest) are NOT salt-stripped ("creatine" vs "creatine
 *    monohydrate" must stay distinct). CORPUS tail names ARE salt-stripped
 *    ("ATORVASTATIN CALCIUM" → atorvastatin) so Orange Book + openFDA unify.
 *  - Brand aliases come from Orange Book products[].trade_name + openFDA
 *    brand_names + Purple Book proprietary_names → "ozempic" resolves to
 *    semaglutide regardless of which single label openFDA returned.
 *  - Projections rebuilt FROM the corpus: core_sources has no body text, so
 *    label sections / trial interventions / pubmed abstracts are reconstructed
 *    by grouping each source's core_source_chunks by `section`.
 *  - "cited" is enforced at the read RPCs (they JOIN core_sources); here we just
 *    set each projection's source_id FK + the bridge rows.
 *
 * Usage:
 *   SERVICE_KEY=... SB_URL=https://<ref>.supabase.co \
 *     deno run -A scripts/entity-link.ts [--only=a,b,c] [--bulk] [--no-projections]
 *
 *   (default = prove-before-bulk: links only the 10 anchor drugs + their
 *    projections. --bulk links the entire corpus + creates Orange-Book tail
 *    entities. Manifest entities + classes are always seeded.)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SB_URL = Deno.env.get("SB_URL");
const SERVICE_KEY = Deno.env.get("SERVICE_KEY");
if (!SB_URL || !SERVICE_KEY) {
  console.error("SB_URL + SERVICE_KEY required");
  Deno.exit(2);
}
const sb = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false } });

function arg(n: string): string | undefined {
  return Deno.args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
}
const flag = (n: string) => Deno.args.includes(`--${n}`);
const BULK = flag("bulk");
const NO_PROJECTIONS = flag("no-projections");
const DEFAULT_ANCHORS = [
  "semaglutide", "metformin", "atorvastatin", "lisinopril", "warfarin",
  "sertraline", "omeprazole", "amlodipine", "levothyroxine", "amoxicillin",
];
const ONLY = (arg("only") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const targetNorms = new Set(
  (BULK ? [] : (ONLY.length ? ONLY : DEFAULT_ANCHORS)).map(normalize),
);

// ============================================================================
// Name normalization
// ============================================================================

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

const SALT = new Set([
  "calcium", "sodium", "potassium", "magnesium", "hydrochloride", "hcl",
  "hydrobromide", "hbr", "sulfate", "sulphate", "phosphate", "besylate",
  "mesylate", "maleate", "fumarate", "succinate", "tartrate", "bitartrate",
  "citrate", "acetate", "hyclate", "monohydrate", "dihydrate", "trihydrate",
  "hemihydrate", "sesquihydrate", "bromide", "chloride", "nitrate", "gluconate",
  "lactate", "pamoate", "valerate", "propionate", "dipropionate", "furoate",
  "xinafoate", "tromethamine", "tosylate", "hydrate", "axetil", "potassium",
]);

// Route / dosage-form qualifiers openFDA bakes into generic_name
// ("ORAL SEMAGLUTIDE", "INSULIN GLARGINE INJECTION", "...EXTENDED RELEASE").
const ROUTE_FORM = new Set([
  "oral", "injection", "injectable", "subcutaneous", "intravenous",
  "intramuscular", "topical", "ophthalmic", "otic", "nasal", "inhalation",
  "inhaled", "sublingual", "buccal", "transdermal", "rectal", "vaginal",
  "extended", "release", "delayed", "er", "xr", "sr", "cr", "la", "odt",
  "kit", "concentrate", "solution", "suspension", "tablet", "tablets",
  "capsule", "capsules", "and", "in",
]);

/** Peel trailing salt/ester/hydrate tokens (corpus tail only). */
function saltStrip(norm: string): string {
  const t = norm.split(" ");
  while (t.length > 1 && SALT.has(t[t.length - 1])) t.pop();
  return t.join(" ");
}

/** Strip leading/trailing route+form qualifiers AND trailing salts. Used for
 * matching corpus names to the catalog ("oral semaglutide" -> "semaglutide"). */
function cleanName(norm: string): string {
  const t = norm.split(" ");
  while (t.length > 1 && ROUTE_FORM.has(t[0])) t.shift();
  while (t.length > 1 && (ROUTE_FORM.has(t[t.length - 1]) || SALT.has(t[t.length - 1]))) t.pop();
  return t.join(" ");
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (_, c) => c.toUpperCase());
}

function statusFor(type: string): string {
  return type === "investigational" ? "investigational"
    : type === "peptide" ? "research_use"
    : type === "supplement" ? "supplement"
    : "approved"; // drug | biologic
}

// Manifest "type" mixes entity_type and status. drug_entities.entity_type only
// allows drug|supplement|peptide|biologic|class|company; "investigational" is a
// status, so investigational compounds are entity_type=drug, status=investigational.
function entityTypeFor(type: string): string {
  return type === "investigational" ? "drug" : type;
}

// ============================================================================
// Load manifest + seed classes & entities
// ============================================================================

interface Entity { name: string; type: string; class?: string }
interface Manifest { classes: string[]; entities: Entity[] }
const manifest: Manifest = JSON.parse(
  await Deno.readTextFile(new URL("./seed-manifest.json", import.meta.url)),
);

interface Ent { id: string; canonical: string; type: string; rxcui?: string | null }
const byNorm = new Map<string, Ent>();        // normalized_name -> entity
// Curated names with precompiled whole-word regexes, for the containment fallback.
const manifestNorms: Array<{ re: RegExp; ent: Ent }> = [];

/** Resolve a corpus name to a catalog entity (exact → salt-stripped → route/
 * form-cleaned → curated-name containment). Read-only; tails are made in Pass A. */
function resolveEntity(name: string): Ent | null {
  const norm = normalize(name);
  const hit = byNorm.get(norm) ?? byNorm.get(saltStrip(norm)) ?? byNorm.get(cleanName(norm));
  if (hit) return hit;
  for (const m of manifestNorms) if (m.re.test(norm)) return m.ent;
  return null;
}

async function seedClasses(): Promise<Map<string, string>> {
  const names = Array.from(new Set([
    ...manifest.classes,
    ...manifest.entities.map((e) => e.class).filter((c): c is string => !!c),
  ]));
  const { data, error } = await sb.from("drug_classes")
    .upsert(names.map((name) => ({ name })), { onConflict: "name" })
    .select("id, name");
  if (error) throw error;
  const map = new Map<string, string>();
  for (const r of data!) map.set(r.name, r.id);
  console.log(`  classes seeded: ${map.size}`);
  return map;
}

async function seedManifestEntities(classMap: Map<string, string>) {
  const rows = manifest.entities.map((e) => ({
    normalized_name: normalize(e.name),
    canonical_name: e.name,
    entity_type: entityTypeFor(e.type),
    approved_status: statusFor(e.type),
    primary_class_id: e.class ? classMap.get(e.class) ?? null : null,
  }));
  const { data, error } = await sb.from("drug_entities")
    .upsert(rows, { onConflict: "normalized_name" })
    .select("id, normalized_name, canonical_name, entity_type");
  if (error) throw error;
  for (const r of data!) {
    const ent = { id: r.id, canonical: r.canonical_name, type: r.entity_type };
    byNorm.set(r.normalized_name, ent);
    if (r.normalized_name.length >= 5) {
      const esc = r.normalized_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      manifestNorms.push({ re: new RegExp(`(?:^|[^a-z0-9])${esc}(?:[^a-z0-9]|$)`), ent });
    }
  }
  // memberships + generic alias
  const memberships: Array<{ drug_entity_id: string; class_id: string }> = [];
  const aliases: AliasRow[] = [];
  for (const e of manifest.entities) {
    const ent = byNorm.get(normalize(e.name))!;
    if (e.class && classMap.get(e.class)) {
      memberships.push({ drug_entity_id: ent.id, class_id: classMap.get(e.class)! });
    }
    aliases.push({ drug_entity_id: ent.id, alias: e.name, alias_type: "generic", source: "manifest" });
  }
  if (memberships.length) {
    const { error } = await sb.from("drug_class_memberships").upsert(memberships, { onConflict: "drug_entity_id,class_id", ignoreDuplicates: true });
    if (error) throw error;
  }
  await flushAliases(aliases);
  console.log(`  manifest entities seeded: ${byNorm.size}`);
}

// ============================================================================
// Source loading + entity resolution
// ============================================================================

interface Src {
  id: string; provider: string; provider_id: string;
  title: string | null; subtitle: string | null; source_url: string | null;
  metadata: Record<string, unknown>; effective_at: string | null;
}

async function loadAll<T>(table: string, select: string, page = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += page) {
    const { data, error } = await sb.from(table).select(select).range(offset, offset + page - 1);
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < page) break;
  }
  return out;
}

interface AliasRow { drug_entity_id: string; alias: string; alias_type: string; source: string }

async function flushAliases(rows: AliasRow[]) {
  const seen = new Set<string>();
  const dedup = rows.filter((r) => {
    const a = r.alias?.trim();
    if (!a || a.length < 2 || a.toUpperCase() === "N/A") return false;
    const k = `${r.drug_entity_id}|${a.toLowerCase()}|${r.alias_type}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  for (let i = 0; i < dedup.length; i += 200) {
    const slice = dedup.slice(i, i + 200);
    const { error } = await sb.from("drug_aliases")
      .upsert(slice, { onConflict: "drug_entity_id,alias,alias_type", ignoreDuplicates: true });
    if (error) throw error;
  }
}

// ============================================================================
// Main
// ============================================================================

console.log(`entity-link → ${SB_URL} | mode=${BULK ? "BULK (full corpus)" : `anchors [${[...targetNorms].join(", ")}]`}`);

const classMap = await seedClasses();
await seedManifestEntities(classMap);

const sources = await loadAll<Src>("core_sources", "id,provider,provider_id,title,subtitle,source_url,metadata,effective_at");
console.log(`  loaded ${sources.length} core_sources`);

// Precompute which seeded entities are "targets" (anchors) for prove-before-bulk.
const targetIds = new Set<string>();
for (const [k, v] of byNorm) if (targetNorms.has(k)) targetIds.add(v.id);
const isTarget = (ent: Ent): boolean => BULK || targetIds.has(ent.id);

// ---- Pass A: collect candidate (name,type) from catalog providers; create tail entities (bulk) ----
function candidateName(s: Src): { name: string; type: string } | null {
  const m = s.metadata ?? {};
  switch (s.provider) {
    case "openfda": {
      const g = (m.generic_names as string[] | undefined)?.[0];
      return g ? { name: g, type: "drug" } : null;
    }
    case "fda_orange_book":
      return m.ingredient ? { name: String(m.ingredient), type: "drug" } : null;
    case "purple_book":
      return m.proper_name ? { name: String(m.proper_name), type: "biologic" } : null;
    case "rxnorm":
      return m.name ? { name: String(m.name), type: "drug" } : null;
    default:
      return null;
  }
}

if (BULK) {
  const tailByNorm = new Map<string, { canonical: string; type: string }>();
  for (const s of sources) {
    const c = candidateName(s);
    if (!c) continue;
    if (resolveEntity(c.name)) continue;                 // already in the catalog
    const tailNorm = cleanName(normalize(c.name));
    if (!tailNorm) continue;
    if (!tailByNorm.has(tailNorm)) tailByNorm.set(tailNorm, { canonical: titleCase(tailNorm), type: c.type });
  }
  const tailRows = [...tailByNorm.entries()].map(([norm, v]) => ({
    normalized_name: norm, canonical_name: v.canonical,
    entity_type: v.type, approved_status: statusFor(v.type),
  }));
  for (let i = 0; i < tailRows.length; i += 500) {
    const slice = tailRows.slice(i, i + 500);
    const { data, error } = await sb.from("drug_entities")
      .upsert(slice, { onConflict: "normalized_name", ignoreDuplicates: false })
      .select("id, normalized_name, canonical_name, entity_type");
    if (error) throw error;
    for (const r of data!) byNorm.set(r.normalized_name, { id: r.id, canonical: r.canonical_name, type: r.entity_type });
  }
  console.log(`  tail entities created: ${tailRows.length} (catalog now ${byNorm.size})`);
}

// ---- Pass B: aliases + bridge links + collect projection sources ----
const aliasRows: AliasRow[] = [];
const bridge: Array<{ drug_entity_id: string; source_id: string; relation: string }> = [];
const rxcuiUpd = new Map<string, string>(); // entityId -> rxcui
const labelSrc: Array<{ src: Src; eid: string }> = [];
const trialSrc: Src[] = [];
const pubmedSrc: Src[] = [];

for (const s of sources) {
  const m = s.metadata ?? {};
  if (s.provider === "clinicaltrials") { if (!NO_PROJECTIONS) trialSrc.push(s); continue; }
  if (s.provider === "pubmed_oa") { if (!NO_PROJECTIONS) pubmedSrc.push(s); continue; }
  if (s.provider === "cms_nadac") continue;

  const c = candidateName(s);
  if (!c) continue;
  const ent = resolveEntity(c.name);
  if (!ent) continue;
  if (!isTarget(ent)) continue;

  // bridge
  const relation = s.provider === "openfda" ? "label_for" : "about";
  bridge.push({ drug_entity_id: ent.id, source_id: s.id, relation });

  // aliases by provider
  if (s.provider === "openfda") {
    for (const b of (m.brand_names as string[] | undefined) ?? []) aliasRows.push({ drug_entity_id: ent.id, alias: b, alias_type: "brand", source: "openfda" });
    for (const g of (m.generic_names as string[] | undefined) ?? []) aliasRows.push({ drug_entity_id: ent.id, alias: g, alias_type: "generic", source: "openfda" });
    const rx = (m.rxcui as string[] | undefined)?.[0];
    if (rx) rxcuiUpd.set(ent.id, rx);
    if (!NO_PROJECTIONS) labelSrc.push({ src: s, eid: ent.id });
  } else if (s.provider === "fda_orange_book") {
    const products = (m.products as Array<{ trade_name?: string }> | undefined) ?? [];
    for (const p of products) if (p.trade_name) aliasRows.push({ drug_entity_id: ent.id, alias: p.trade_name, alias_type: "brand", source: "orange_book" });
  } else if (s.provider === "purple_book") {
    for (const b of (m.proprietary_names as string[] | undefined) ?? []) aliasRows.push({ drug_entity_id: ent.id, alias: b, alias_type: "brand", source: "purple_book" });
  } else if (s.provider === "rxnorm") {
    if (m.rxcui) rxcuiUpd.set(ent.id, String(m.rxcui));
  }
}

await flushAliases(aliasRows);
for (let i = 0; i < bridge.length; i += 300) {
  const { error } = await sb.from("drug_entity_sources").upsert(bridge.slice(i, i + 300), { onConflict: "drug_entity_id,source_id", ignoreDuplicates: true });
  if (error) throw error;
}
for (const [id, rxcui] of rxcuiUpd) {
  const { error } = await sb.from("drug_entities").update({ rxnorm_cui: rxcui }).eq("id", id).is("rxnorm_cui", null);
  if (error) throw error;
}
console.log(`  aliases=${aliasRows.length} bridge=${bridge.length} rxcui=${rxcuiUpd.size} | labels=${labelSrc.length} trials=${trialSrc.length} pubmed=${pubmedSrc.length}`);

// ============================================================================
// Projections (rebuild section bodies from core_source_chunks)
// ============================================================================

const LABEL_KEY: Record<string, string> = {
  "BOXED WARNING": "boxed_warning",
  "INDICATIONS AND USAGE": "indications",
  "DOSAGE AND ADMINISTRATION": "dosage_and_administration",
  "CONTRAINDICATIONS": "contraindications",
  "WARNINGS AND PRECAUTIONS": "warnings",
  "ADVERSE REACTIONS": "adverse_reactions",
  "DRUG INTERACTIONS": "drug_interactions",
  "MECHANISM OF ACTION": "mechanism_of_action",
  "CLINICAL PHARMACOLOGY": "clinical_pharmacology",
  "PHARMACOKINETICS": "pharmacokinetics",
  "USE IN SPECIFIC POPULATIONS": "specific_populations",
  "PREGNANCY": "pregnancy_lactation",
  "PEDIATRIC USE": "pediatric_use",
  "GERIATRIC USE": "geriatric_use",
  "DESCRIPTION": "description",
};
const snake = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

interface Chunk { source_id: string; section: string | null; content: string; position: number }

async function chunksFor(ids: string[]): Promise<Map<string, Chunk[]>> {
  const map = new Map<string, Chunk[]>();
  for (let i = 0; i < ids.length; i += 50) {
    const slice = ids.slice(i, i + 50);
    const { data, error } = await sb.from("core_source_chunks")
      .select("source_id,section,content,position").in("source_id", slice);
    if (error) throw error;
    for (const c of data as Chunk[]) {
      (map.get(c.source_id) ?? map.set(c.source_id, []).get(c.source_id)!).push(c);
    }
  }
  for (const arr of map.values()) arr.sort((a, b) => a.position - b.position);
  return map;
}

function sectionBodies(chunks: Chunk[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of chunks) {
    const key = c.section ?? "_body";
    m.set(key, (m.get(key) ? m.get(key) + "\n\n" : "") + c.content);
  }
  return m;
}

if (!NO_PROJECTIONS) {
  // ---- label_documents ----
  if (labelSrc.length) {
    const cmap = await chunksFor(labelSrc.map((l) => l.src.id));
    const rows: Record<string, unknown>[] = [];
    const mechUpd = new Map<string, string>();
    for (const { src, eid } of labelSrc) {
      const bodies = sectionBodies(cmap.get(src.id) ?? []);
      const extracted: Record<string, string> = {};
      for (const [heading, body] of bodies) {
        if (heading === "_body") continue;
        extracted[LABEL_KEY[heading] ?? snake(heading)] = body;
      }
      const mech = bodies.get("MECHANISM OF ACTION");
      if (mech) mechUpd.set(eid, mech.slice(0, 600));
      rows.push({
        drug_entity_id: eid, source: "openfda", set_id: src.provider_id,
        label_url: src.source_url,
        published_date: src.effective_at ? src.effective_at.slice(0, 10) : null,
        extracted_sections: extracted, source_id: src.id,
      });
    }
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await sb.from("label_documents").upsert(rows.slice(i, i + 100), { onConflict: "source,set_id" });
      if (error) throw error;
    }
    for (const [id, mech] of mechUpd) {
      const { error } = await sb.from("drug_entities").update({ mechanism_summary: mech }).eq("id", id).is("mechanism_summary", null);
      if (error) throw error;
    }
    console.log(`  label_documents: ${rows.length}`);
  }

  // ---- alias/name match index for trial+pubmed linking ----
  const needles: Array<{ re: RegExp; eid: string }> = [];
  {
    // MUST paginate: drug_aliases exceeds PostgREST's 1000-row cap on --bulk, and
    // a truncated needle set silently under-links trials/pubmed (counts under-report).
    const data = await loadAll<{ drug_entity_id: string; alias: string }>("drug_aliases", "drug_entity_id,alias");
    const seen = new Set<string>();
    const add = (text: string, eid: string) => {
      const n = normalize(text);
      if (n.length < 4) return;
      const k = `${eid}|${n}`;
      if (seen.has(k)) return;
      seen.add(k);
      const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      needles.push({ re: new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`, "i"), eid });
    };
    for (const [, e] of byNorm) add(e.canonical, e.id);
    for (const a of data) add(a.alias, a.drug_entity_id);
  }
  function linkEntities(text: string): Set<string> {
    const hits = new Set<string>();
    const t = text.toLowerCase();
    for (const { re, eid } of needles) if (re.test(t)) hits.add(eid);
    return hits;
  }

  // ---- clinical_trials ----
  if (trialSrc.length) {
    const cmap = await chunksFor(trialSrc.map((s) => s.id));
    const links: Array<{ drug_entity_id: string; trial_id: string }> = [];
    for (let i = 0; i < trialSrc.length; i += 100) {
      const batch = trialSrc.slice(i, i + 100);
      const rows = batch.map((s) => {
        const m = s.metadata ?? {};
        const bodies = sectionBodies(cmap.get(s.id) ?? []);
        const interventions = (bodies.get("INTERVENTIONS") ?? "").split(/;|\n/).map((x) => x.trim()).filter(Boolean);
        const primary = (bodies.get("PRIMARY OUTCOMES") ?? "").split(/\n/).map((x) => x.trim()).filter(Boolean);
        const secondary = (bodies.get("SECONDARY OUTCOMES") ?? "").split(/\n/).map((x) => x.trim()).filter(Boolean);
        return {
          nct_id: String(m.nct_id ?? s.provider_id), brief_title: s.title, official_title: s.subtitle,
          phase: (m.phases as string[] | undefined)?.[0] ?? null, status: (m.status as string) ?? null,
          conditions: (m.conditions as string[] | undefined) ?? [], interventions, primary_outcomes: primary, secondary_outcomes: secondary,
          source_url: s.source_url, source_id: s.id,
          last_update_posted: s.effective_at ? s.effective_at.slice(0, 10) : null,
        };
      });
      const { data, error } = await sb.from("clinical_trials").upsert(rows, { onConflict: "nct_id" }).select("id, nct_id, brief_title, official_title, conditions, interventions");
      if (error) throw error;
      for (const t of data!) {
        const text = [t.brief_title, t.official_title, (t.conditions ?? []).join(" "), (t.interventions ?? []).join(" ")].filter(Boolean).join(" ");
        for (const eid of linkEntities(text)) links.push({ drug_entity_id: eid, trial_id: t.id });
      }
    }
    for (let i = 0; i < links.length; i += 300) {
      const { error } = await sb.from("drug_entity_trials").upsert(links.slice(i, i + 300), { onConflict: "drug_entity_id,trial_id", ignoreDuplicates: true });
      if (error) throw error;
    }
    console.log(`  clinical_trials: ${trialSrc.length} | trial↔entity links: ${links.length}`);
  }

  // ---- pubmed_articles ----
  if (pubmedSrc.length) {
    const cmap = await chunksFor(pubmedSrc.map((s) => s.id));
    const links: Array<{ drug_entity_id: string; article_id: string }> = [];
    for (let i = 0; i < pubmedSrc.length; i += 100) {
      const batch = pubmedSrc.slice(i, i + 100);
      const rows = batch.map((s) => {
        const m = s.metadata ?? {};
        const bodies = sectionBodies(cmap.get(s.id) ?? []);
        const abstract = bodies.get("ABSTRACT") ?? null;
        const year = m.year as number | undefined;
        return {
          pmid: String(m.pmid ?? s.provider_id), title: s.title, abstract,
          journal: (m.journal as string) ?? s.subtitle ?? null,
          authors: (m.authors as string[] | undefined) ?? [], mesh_terms: (m.mesh as string[] | undefined) ?? [],
          publication_date: year ? `${year}-01-01` : null, source_url: s.source_url, source_id: s.id,
        };
      });
      const { data, error } = await sb.from("pubmed_articles").upsert(rows, { onConflict: "pmid" }).select("id, title, abstract, mesh_terms");
      if (error) throw error;
      for (const a of data!) {
        const text = [a.title, a.abstract, (a.mesh_terms ?? []).join(" ")].filter(Boolean).join(" ");
        for (const eid of linkEntities(text)) links.push({ drug_entity_id: eid, article_id: a.id });
      }
    }
    for (let i = 0; i < links.length; i += 300) {
      const { error } = await sb.from("drug_entity_pubmed").upsert(links.slice(i, i + 300), { onConflict: "drug_entity_id,article_id", ignoreDuplicates: true });
      if (error) throw error;
    }
    console.log(`  pubmed_articles: ${pubmedSrc.length} | article↔entity links: ${links.length}`);
  }
}

// ---- summary ----
async function count(t: string): Promise<number> {
  const { count } = await sb.from(t).select("*", { count: "exact", head: true });
  return count ?? 0;
}
console.log("\n=== CATALOG ===");
for (const t of ["drug_entities", "drug_aliases", "drug_classes", "drug_class_memberships", "drug_entity_sources", "label_documents", "clinical_trials", "pubmed_articles", "drug_entity_trials", "drug_entity_pubmed"]) {
  console.log(`  ${t}: ${await count(t)}`);
}
console.log("done.");
