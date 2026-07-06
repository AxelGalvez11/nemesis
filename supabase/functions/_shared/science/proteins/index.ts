// Derived from synthetic-sciences/openscience (Apache-2.0) — see _shared/science/NOTICE.md
/**
 * Protein / structure connector bundle.
 *
 * Feature-agent output for the "proteins" batch. The integration stage imports
 * the default array below and registers each connector on the shared registry
 * (see ../index.ts). Nothing here mutates shared state.
 *
 * Connectors:
 *   uniprot     — UniProtKB protein sequences & functional annotation
 *   rcsb-pdb    — RCSB Protein Data Bank experimental 3D structures
 *   pdbe        — Protein Data Bank in Europe (EBI annotations)
 *   alphafold   — AlphaFold DB predicted structures
 *   interpro    — InterPro integrated families/domains/sites
 *   pfam        — Pfam families/domains (via the InterPro API)
 *   sifts       — UniProt↔PDB residue-level mappings
 */
import type { Connector } from "../types.ts"
import { uniprot } from "./uniprot.ts"
import { rcsbPdb } from "./rcsb-pdb.ts"
import { pdbe } from "./pdbe.ts"
import { alphafold } from "./alphafold.ts"
import { interpro, pfam } from "./interpro.ts"
import { sifts } from "./sifts.ts"

export { uniprot, rcsbPdb, pdbe, alphafold, interpro, pfam, sifts }

/** All protein/structure connectors in this batch. */
const proteinConnectors: Connector[] = [uniprot, rcsbPdb, pdbe, alphafold, interpro, pfam, sifts]

export default proteinConnectors