// Derived from synthetic-sciences/openscience (Apache-2.0) — see _shared/science/NOTICE.md
/**
 * Genomics connectors — one uniform `Connector` per public, keyless data source.
 *
 * The default export is a flat array the integration stage registers in one call:
 *
 *   import genomicsConnectors from "./genomics.ts"
 *   for (const c of genomicsConnectors) registry.register(c)
 *
 * Individual connectors are also re-exported by name for selective registration.
 */
import type { Connector } from "../types.ts"
import { ensembl } from "./ensembl.ts"
import { ncbiGene } from "./ncbi-gene.ts"
import { dbsnp } from "./dbsnp.ts"
import { clinvar } from "./clinvar.ts"
import { gnomad } from "./gnomad.ts"
import { ucsc } from "./ucsc.ts"
import { mygene } from "./mygene.ts"
import { myvariant } from "./myvariant.ts"

export { ensembl, ncbiGene, dbsnp, clinvar, gnomad, ucsc, mygene, myvariant }

/** All genomics connectors, in a sensible display order. */
const genomicsConnectors: Connector[] = [ensembl, ncbiGene, dbsnp, clinvar, gnomad, ucsc, mygene, myvariant]

export default genomicsConnectors