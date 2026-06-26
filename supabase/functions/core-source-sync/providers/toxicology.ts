/**
 * Toxicology context provider wrapper.
 *
 * First version is deliberately configuration-driven: it only emits a source when
 * an operator supplies public/allowlisted text. That keeps the engine from silently
 * scraping arbitrary toxicology pages while still allowing launch-critical safety
 * context for common consumer-product questions.
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../normalized-source.ts";

const ALLOWLISTED_HOSTS = new Set([
  "medlineplus.gov",
  "www.medlineplus.gov",
  "ncbi.nlm.nih.gov",
  "www.ncbi.nlm.nih.gov",
]);

export interface ToxicologyFetchOpts {
  query: string;
  limit?: number;
}

export interface ToxicologySourceInput {
  query: string;
  title: string;
  sourceUrl: string;
  text: string;
}

export function toxicologyConfigured(sourceUrl = Deno.env.get("TOXICOLOGY_SOURCE_URL") ?? undefined): boolean {
  if (!sourceUrl) return false;
  try {
    const url = new URL(sourceUrl);
    return url.protocol === "https:" && ALLOWLISTED_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export async function fetchToxicologyReference(opts: ToxicologyFetchOpts): Promise<NormalizedSource[]> {
  const sourceUrl = Deno.env.get("TOXICOLOGY_SOURCE_URL");
  const text = Deno.env.get("TOXICOLOGY_SOURCE_TEXT");
  if (!sourceUrl || !text || !toxicologyConfigured(sourceUrl)) return [];

  const title = Deno.env.get("TOXICOLOGY_SOURCE_TITLE") ?? `Toxicology reference: ${opts.query}`;
  return [await buildToxicologySource({
    query: opts.query,
    title,
    sourceUrl,
    text,
  })];
}

export async function buildToxicologySource(input: ToxicologySourceInput): Promise<NormalizedSource> {
  const text = input.text.replace(/\s+/g, " ").trim();
  const contentText = `${input.title}\n\n${text}`;

  return {
    provider: "nih",
    provider_id: `toxicology:${slug(input.query)}`,
    title: input.title,
    subtitle: "Configured toxicology reference",
    source_url: input.sourceUrl,
    license: "public_domain",
    content_text: contentText,
    content_hash: await sha256Hex(contentText),
    metadata: {
      source: "toxicology",
      query: input.query,
    },
  };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "reference";
}
