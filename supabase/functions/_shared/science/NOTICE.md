# NOTICE — scientific database connectors

This directory (`supabase/functions/_shared/science/`) is **derived from**
[synthetic-sciences/openscience](https://github.com/synthetic-sciences/openscience)
(`backend/cli/src/science/connectors/`), which is licensed under the Apache
License, Version 2.0. The upstream copyright notice is preserved below, and the
full license text is in the adjacent `LICENSE` file, as required by Apache-2.0 §4.

```
OpenScience
Copyright 2026 Synthetic Sciences

This product includes software developed at Synthetic Sciences.
Licensed under the Apache License, Version 2.0.
```

## Modifications made when porting into PharmaOrb (2026-07-05)

- **Runtime**: the code was written for a Bun/Node runtime; ported to run inside
  a Supabase **Deno** edge function. Every `process.env.X` read was changed to
  `Deno.env.get("X")`, and all relative import specifiers were given explicit
  `.ts` extensions (Deno requires them).
- **Default polite-pool identifier**: the OpenAlex default `mailto` was changed
  from the upstream author's contact to `support@pharmaorb.app`.
- No connector logic, ranking, or API behavior was changed.

## Third-party data sources (unchanged from upstream NOTICE)

The connectors here access third-party **public web APIs** (UniProt, RCSB PDB,
PDBe, AlphaFold DB, InterPro, Ensembl, NCBI E-utilities, ClinVar, gnomAD, UCSC,
ChEMBL, PubChem, ChEBI, Reactome, KEGG, STRING, IntAct, WikiPathways, Open
Targets, GEO, ArrayExpress, GTEx, the Human Protein Atlas, Europe PMC, Crossref,
OpenAlex, Semantic Scholar, arXiv, bioRxiv, and others). PharmaOrb does not
redistribute the data served by these APIs. Each source is governed by its own
terms of use; users are responsible for complying with the terms of any data
source they query.
