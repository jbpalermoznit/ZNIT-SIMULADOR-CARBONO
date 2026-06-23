/**
 * Provider de embeddings para a busca semântica de fatores (RAG).
 *
 * A Anthropic não oferece API de embeddings; a recomendação oficial é a
 * Voyage AI. Usamos voyage-3.5 (1024 dimensões) via REST. O provider é
 * trocável por env (FACTOR_EMBEDDINGS_PROVIDER) caso queira OpenAI/outro
 * no futuro — mas hoje só Voyage está implementado.
 *
 * Requer VOYAGE_API_KEY. Sem a chave, embedTexts lança — os chamadores
 * (vector-search, backfill) só são acionados sob flag.
 */

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = process.env.FACTOR_EMBEDDINGS_MODEL ?? "voyage-3.5";
/** Dimensão do voyage-3.5; mantenha em sync com a coluna vector(N) da migração. */
export const EMBEDDING_DIM = 1024;

export type EmbeddingInputType = "query" | "document";

export async function embedTexts(
  texts: string[],
  inputType: EmbeddingInputType
): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY não configurada");
  if (texts.length === 0) return [];

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: texts, model: MODEL, input_type: inputType }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Voyage embeddings status ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
  };
  // Garante ordem por index (a API devolve ordenado, mas não custa)
  return data.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

export async function embedOne(
  text: string,
  inputType: EmbeddingInputType
): Promise<number[]> {
  const [v] = await embedTexts([text], inputType);
  return v;
}
