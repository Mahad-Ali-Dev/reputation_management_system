/**
 * Voyage AI embeddings client (REST, no SDK).
 *
 * Model: voyage-3 (1024-dim, $0.06/MTok)
 * https://docs.voyageai.com/reference/embeddings-api
 */

const VOYAGE_API = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3";
export const VOYAGE_DIM = 1024;

type EmbedInputType = "document" | "query";

export async function voyageEmbed(args: {
  input: string | string[];
  inputType: EmbedInputType;
}): Promise<number[][]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY not set");

  const inputs = Array.isArray(args.input) ? args.input : [args.input];
  // Voyage limits ~128 texts per request, 4096 tokens each
  if (inputs.length > 128) throw new Error("Voyage: batch must be <= 128");

  const res = await fetch(VOYAGE_API, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: inputs,
      input_type: args.inputType,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`voyage_${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
    usage: { total_tokens: number };
  };
  // Sort by index to preserve input order
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}
