// Derived from synthetic-sciences/openscience (Apache-2.0) — see _shared/science/NOTICE.md
/**
 * Pathways & molecular-interaction connectors.
 *
 * One connector per public, key-free scientific data source covering biological
 * pathways and interaction networks. The integration stage imports the single
 * `pathwayConnectors` array below and registers each entry on the shared
 * `ConnectorRegistry` — feature agents add sources here without touching the
 * shared `connectors/index.ts`.
 */
import type { Connector } from "../types.ts"
import { reactome } from "./reactome.ts"
import { kegg } from "./kegg.ts"
import { stringdb } from "./string-db.ts"
import { biogrid } from "./biogrid.ts"
import { intact } from "./intact.ts"
import { wikipathways } from "./wikipathways.ts"
import { opentargets } from "./opentargets.ts"

/** All pathway/interaction connectors in this batch, in catalog order. */
export const pathwayConnectors: Connector[] = [reactome, kegg, stringdb, biogrid, intact, wikipathways, opentargets]

export { reactome, kegg, stringdb, biogrid, intact, wikipathways, opentargets }

export default pathwayConnectors