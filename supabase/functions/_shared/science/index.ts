// Derived from synthetic-sciences/openscience (Apache-2.0) — see _shared/science/NOTICE.md
/**
 * The single shared connector registry instance.
 *
 * Feature agents add ONE line per source below the AUTO marker and register it.
 * Nothing else in the codebase should construct a ConnectorRegistry — the tools
 * (`science_search`, `science_list_dbs`) and any UI import `registry` from here.
 *
 * Example integration (added by the integration stage, NOT by feature agents):
 *
 *   import { uniprot } from "./impl/uniprot.ts"
 *   ...
 *   registry.register(uniprot)
 */
import { ConnectorRegistry } from "./types.ts"

export const registry = new ConnectorRegistry()

// ── connector imports ──────────────────────────────────────────────────────
// AUTO: connectors registered here by integration
// (feature agents: create ./impl/<id>.ts, then add an import + registry.register
//  call inside the block below during the integration stage — do NOT edit this
//  file yourself.)
import proteins from "./proteins/index.ts"
import genomics from "./genomics/index.ts"
import chemistry from "./chemistry/index.ts"
import pathways from "./pathways/index.ts"
import literature from "./literature/index.ts"
import omics from "./omics/index.ts"

for (const c of [...proteins, ...genomics, ...chemistry, ...pathways, ...literature, ...omics]) {
  registry.register(c)
}
// ────────────────────────────────────────────────────────────────────────────

export * from "./types.ts"
export * as http from "./http.ts"