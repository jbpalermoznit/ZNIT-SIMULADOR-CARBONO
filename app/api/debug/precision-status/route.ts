/**
 * GET /api/debug/precision-status
 *
 * Diagnóstico admin-only: reporta o estado REAL (runtime) da stack de precisão
 * no processo em execução — não basta a flag estar no painel do Vercel, ela só
 * tem efeito se a CHAVE também estiver presente e houver redeploy.
 *
 * O campo `effective` é a verdade: é exatamente o que `autoMatchItem` consulta
 * (`isVectorSearchEnabled()` / `isRerankerEnabled()`). Se `effective` for true
 * para ambos, a busca vetorial e o reranker estão ligados neste deployment.
 */
import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized, forbidden } from "@/lib/server/auth";
import { isVectorSearchEnabled } from "@/lib/server/factor-search/vector-search";
import { isRerankerEnabled } from "@/lib/server/factor-search/claude-reranker";

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }
  if (user.role !== "admin") return forbidden();

  return Response.json({
    vector_search: {
      enabled_flag: process.env.FACTOR_VECTOR_SEARCH_ENABLED === "true",
      voyage_key_present: !!process.env.VOYAGE_API_KEY,
      embeddings_model: process.env.FACTOR_EMBEDDINGS_MODEL ?? "voyage-3.5",
      // A verdade que o matcher usa: flag && chave presente.
      effective: isVectorSearchEnabled(),
    },
    reranker: {
      enabled_flag: process.env.FACTOR_RERANKER_ENABLED === "true",
      anthropic_key_present: !!process.env.ANTHROPIC_API_KEY,
      model: process.env.FACTOR_RERANKER_MODEL ?? "claude-opus-4-8",
      effective: isRerankerEnabled(),
    },
    // Estimador de preço por IA (Recomendações de redução). `effective` =
    // flag && chave, idêntico ao isPriceEstimationEnabled() do estimador.
    price_estimation: {
      enabled_flag: process.env.PRICE_ESTIMATION_ENABLED === "true",
      anthropic_key_present: !!process.env.ANTHROPIC_API_KEY,
      model: process.env.FACTOR_PRICE_MODEL ?? "claude-haiku-4-5-20251001",
      effective:
        process.env.PRICE_ESTIMATION_ENABLED === "true" &&
        !!process.env.ANTHROPIC_API_KEY,
    },
  });
}
