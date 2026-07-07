// Derived from synthetic-sciences/openscience (Apache-2.0) — see _shared/science/NOTICE.md
/**
 * Literature connectors — scholarly / preprint databases.
 *
 * Each connector wraps ONE public, key-free scholarly API behind the shared
 * `Connector` contract. The integration stage imports the default array below
 * and registers every entry with the shared `ConnectorRegistry` (see the
 * `// AUTO:` marker in `../index.ts`) — this folder does not touch shared files.
 */
import type { Connector } from "../types.ts"
import { pubmed } from "./pubmed.ts"
import { europepmc } from "./europepmc.ts"
import { biorxiv } from "./biorxiv.ts"
import { crossref } from "./crossref.ts"
import { openalex } from "./openalex.ts"
import { semanticScholar } from "./semantic-scholar.ts"
import { arxiv } from "./arxiv.ts"

export { pubmed, europepmc, biorxiv, crossref, openalex, semanticScholar, arxiv }

/** All literature connectors, ready for the integration stage to register. */
const connectors: Connector[] = [pubmed, europepmc, biorxiv, crossref, openalex, semanticScholar, arxiv]

export default connectors