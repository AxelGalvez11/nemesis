/**
 * The canonical normalized-source shape, in a LEAF module with no runtime deps.
 *
 * Every provider (and the live-evidence path) produces a NormalizedSource, but only
 * persist.ts actually writes it to the database. Keeping the TYPE here — separate from
 * persist.ts, which imports the Supabase client (@supabase/supabase-js) — means a module
 * that merely returns or names a NormalizedSource does NOT transitively pull the DB client
 * into its type-check graph. That matters for the /ask unit gate (deno test, no node_modules):
 * live-sources.ts + its providers are type-checked there, and dragging supabase-js in made
 * deno fail to resolve the client's transitive `npm:@types/node`. persist.ts re-exports this
 * type, so the many ingest-only importers keep importing it from persist.ts unchanged.
 */
import type { CoreSourceLicense, CoreSourceProvider } from "./license.ts";

export interface NormalizedSource {
  readonly provider: CoreSourceProvider;
  readonly provider_id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly source_url: string;
  readonly license: CoreSourceLicense;
  readonly content_text: string; // full raw text passed to chunker
  readonly content_hash: string; // sha256 hex of normalized content
  readonly metadata: Record<string, unknown>;
  readonly effective_at?: string;
}
