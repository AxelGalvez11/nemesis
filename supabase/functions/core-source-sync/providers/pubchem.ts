/**
 * Phase 7: NIH PubChem provider.
 *
 * API: https://pubchem.ncbi.nlm.nih.gov/rest/pug/ (REST PUG, no auth).
 * License: public_domain (NIH NLM).
 *
 * Pulls compound-level data (canonical SMILES, IUPAC name, molecular
 * formula, target list, mechanism summary). Used as cross-reference
 * for drug structure + target-binding context on mechanism cards.
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../persist.ts";

const BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound";
const REQUEST_DELAY_MS = 250;

export interface PubChemFetchOpts {
  /** Drug names to look up. */
  names: ReadonlyArray<string>;
}

export async function fetchPubChemCompounds(
  opts: PubChemFetchOpts,
): Promise<NormalizedSource[]> {
  const sources: NormalizedSource[] = [];
  for (const name of opts.names) {
    try {
      const cidRes = await fetch(
        `${BASE}/name/${encodeURIComponent(name)}/cids/JSON`,
        { headers: { "User-Agent": "AscendBot/1.0" } },
      );
      if (!cidRes.ok) continue;
      const cidData = await cidRes.json();
      const cid: number | undefined = cidData?.IdentifierList?.CID?.[0];
      if (!cid) continue;

      await sleep(REQUEST_DELAY_MS);

      const propsRes = await fetch(
        `${BASE}/cid/${cid}/property/IUPACName,MolecularFormula,MolecularWeight,CanonicalSMILES,XLogP/JSON`,
        { headers: { "User-Agent": "AscendBot/1.0" } },
      );
      if (!propsRes.ok) continue;
      const propsData = await propsRes.json();
      const props = propsData?.PropertyTable?.Properties?.[0] ?? {};

      const content_text = [
        `PUBCHEM COMPOUND ${name} (CID ${cid})`,
        "",
        `IUPAC: ${props.IUPACName ?? ""}`,
        `Formula: ${props.MolecularFormula ?? ""}`,
        `MW: ${props.MolecularWeight ?? ""}`,
        `SMILES: ${props.CanonicalSMILES ?? ""}`,
        `XLogP: ${props.XLogP ?? ""}`,
      ]
        .filter(Boolean)
        .join("\n");

      sources.push({
        provider: "pubchem",
        provider_id: String(cid),
        title: `PubChem: ${name}`,
        subtitle: props.IUPACName ?? undefined,
        source_url: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`,
        license: "public_domain",
        content_text,
        content_hash: await sha256Hex(content_text),
        metadata: {
          cid,
          name,
          iupac_name: props.IUPACName ?? null,
          molecular_formula: props.MolecularFormula ?? null,
          molecular_weight: props.MolecularWeight ?? null,
          xlogp: props.XLogP ?? null,
        },
      });
    } catch (e) {
      console.warn(`PubChem fetch failed for ${name}: ${(e as Error).message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  return sources;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
