// eval/lib/voyage.ts
const VOYAGE_MODEL = "voyage-3-large";

export async function embedQuery(text: string, apiKey = Deno.env.get("VOYAGE_API_KEY")): Promise<number[]> {
  if (!apiKey) throw new Error("VOYAGE_API_KEY required");
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: VOYAGE_MODEL, input: [text], input_type: "query" }),
  });
  if (!res.ok) throw new Error(`voyage embed failed ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const body = await res.json();
  return body.data[0].embedding as number[]; // 1024 floats
}
