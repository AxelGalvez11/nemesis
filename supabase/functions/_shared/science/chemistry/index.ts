// Derived from synthetic-sciences/openscience (Apache-2.0) — see _shared/science/NOTICE.md
/**
 * Chemistry connector bundle.
 *
 * Each file in this folder wraps ONE public, keyless chemical database behind the
 * shared `Connector` contract (`../types`). The integration stage imports this
 * default array and registers every entry against the shared registry — nothing
 * here edits the shared `connectors/index.ts`.
 */
import type { Connector } from "../types.ts"
import { chembl } from "./chembl.ts"
import { pubchem } from "./pubchem.ts"
import { bindingdb } from "./bindingdb.ts"
import { gtopdb } from "./gtopdb.ts"
import { surechembl } from "./surechembl.ts"
import { chebi } from "./chebi.ts"

export { chembl, pubchem, bindingdb, gtopdb, surechembl, chebi }

/** All chemistry-domain connectors, ready to register. */
const chemistryConnectors: Connector[] = [chembl, pubchem, bindingdb, gtopdb, surechembl, chebi]

export default chemistryConnectors