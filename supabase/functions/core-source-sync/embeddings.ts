/**
 * Phase 7: 1024-dim embeddings for Layer 1 clinical content.
 *
 * Primary: Voyage AI voyage-3-large (best-in-class MTEB medical
 * retrieval; ~half the cost of OpenAI text-embedding-3-large).
 * Fallback: Cohere embed-v4.0 at output_dimension=1024.
 * Last-resort fallback: OpenAI text-embedding-3-large at dimensions=1024.
 *
 * Distinct from ai-generate/embeddings.ts which uses 768-dim Gemini for
 * user-uploaded text content. Layer 1 needs higher fidelity for
 * mechanism / contraindication / interaction retrieval.
 *
 * See: supabase/migrations/0107_voyage_1024_embeddings.sql
 */

const VOYAGE_MODEL = "voyage-3-large";
const VOYAGE_BATCH_LIMIT = 128;
const VOYAGE_OUTPUT_DIM = 1024;
const COHERE_MODEL = "embed-v4.0";
const COHERE_BATCH_LIMIT = 96;
const OPENAI_MODEL = "text-embedding-3-large";
const OPENAI_BATCH_LIMIT = 100;

export async function embedCoreTexts(
  texts: string[],
  inputType: "document" | "query" = "document",
): Promise<number[][]> {
  if (!texts.length) return [];

  const voyageKey = Deno.env.get("VOYAGE_API_KEY");
  if (voyageKey) {
    try {
      return await embedWithVoyage(voyageKey, texts, inputType);
    } catch (e) {
      console.warn(
        "Voyage 3-large embed failed, falling back to Cohere:",
        (e as Error).message,
      );
    }
  }

  const cohereKey = Deno.env.get("COHERE_API_KEY");
  if (cohereKey) {
    try {
      return await embedWithCohere(cohereKey, texts, inputType);
    } catch (e) {
      console.warn(
        "Cohere embed failed, falling back to OpenAI:",
        (e as Error).message,
      );
    }
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (openaiKey) {
    return await embedWithOpenAI(openaiKey, texts);
  }

  throw new Error(
    "No 1024-dim embedding key configured. Set VOYAGE_API_KEY (preferred), COHERE_API_KEY (fallback), or OPENAI_API_KEY (last resort).",
  );
}

async function embedWithVoyage(
  apiKey: string,
  texts: string[],
  inputType: "document" | "query",
): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += VOYAGE_BATCH_LIMIT) {
    const batch = texts.slice(i, i + VOYAGE_BATCH_LIMIT);

    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: VOYAGE_MODEL,
        input: batch,
        input_type: inputType,
        output_dimension: VOYAGE_OUTPUT_DIM,
        truncation: true,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(
        `Voyage Embedding API ${res.status}: ${err.slice(0, 300)}`,
      );
    }

    const data = await res.json();
    const sorted = data.data
      .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
      .map((d: { embedding: number[] }) => d.embedding);
    results.push(...sorted);
  }

  return results;
}

async function embedWithCohere(
  apiKey: string,
  texts: string[],
  inputType: "document" | "query",
): Promise<number[][]> {
  const results: number[][] = [];
  const cohereInputType =
    inputType === "query" ? "search_query" : "search_document";

  for (let i = 0; i < texts.length; i += COHERE_BATCH_LIMIT) {
    const batch = texts.slice(i, i + COHERE_BATCH_LIMIT);

    const res = await fetch("https://api.cohere.com/v2/embed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: COHERE_MODEL,
        input_type: cohereInputType,
        embedding_types: ["float"],
        output_dimension: VOYAGE_OUTPUT_DIM, // 1024 to match Voyage primary
        truncate: "END",
        texts: batch,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(
        `Cohere Embedding API ${res.status}: ${err.slice(0, 300)}`,
      );
    }

    const data = await res.json();
    const embeddings = data?.embeddings?.float;
    if (!Array.isArray(embeddings)) {
      throw new Error("Invalid Cohere embedding response");
    }
    results.push(...(embeddings as number[][]));
  }

  return results;
}

async function embedWithOpenAI(
  apiKey: string,
  texts: string[],
): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += OPENAI_BATCH_LIMIT) {
    const batch = texts.slice(i, i + OPENAI_BATCH_LIMIT);

    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: batch,
        dimensions: VOYAGE_OUTPUT_DIM, // truncate to 1024 to match schema
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(
        `OpenAI Embedding API ${res.status}: ${err.slice(0, 300)}`,
      );
    }

    const data = await res.json();
    const sorted = data.data
      .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
      .map((d: { embedding: number[] }) => d.embedding);
    results.push(...sorted);
  }

  return results;
}

/** SHA-256 hex of input — used for content_hash + change detection. */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
