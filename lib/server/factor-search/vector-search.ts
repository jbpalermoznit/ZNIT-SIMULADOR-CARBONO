/**
 * Recuperação semântica de fatores (RAG) via pgvector.
 *
 * Embeda a descrição do item e busca os fatores mais próximos por similaridade
 * de cosseno na tabela `backend.factor_embeddings` (ver migração
 * supabase/migration-pgvector-factor-embeddings.sql e o script de backfill).
 * Os candidatos retornados entram no MESMO pool do matcher determinístico
 * (mesma interface MatchCandidate), passando pelos mesmos filtros/guardas.
 *
 * Ganho de precisão: recall semântico — casa sinônimos/variações que o
 * dicionário de keywords não cobre ("vergalhão" ≈ "aço CA-50" ≈ "reinforcing
 * steel"). Não substitui o determinístico; soma a ele.
 *
 * SEGURANÇA: desligado por padrão. Só roda com FACTOR_VECTOR_SEARCH_ENABLED=true
 * E VOYAGE_API_KEY. Qualquer erro → [] (o pool determinístico segue).
 */

import { supabaseEmission } from "@/lib/server/supabase";
import { embedOne } from "@/lib/server/factor-search/embeddings";
import type { MatchCandidate } from "@/lib/server/emission-mapper";

const MATCH_COUNT = 15;

export function isVectorSearchEnabled(): boolean {
  return (
    process.env.FACTOR_VECTOR_SEARCH_ENABLED === "true" &&
    !!process.env.VOYAGE_API_KEY
  );
}

interface MatchRow {
  source_tier: string;
  source_id: string;
  factor_name: string | null;
  factor_value: number | null;
  factor_unit: string | null;
  product_unit: string | null;
  factor_source: string | null;
  similarity: number | null;
}

export async function vectorSearchCandidates(
  description: string
): Promise<MatchCandidate[]> {
  if (!isVectorSearchEnabled()) return [];
  if (!description?.trim()) return [];

  try {
    const embedding = await embedOne(description, "query");

    const { data, error } = await supabaseEmission.rpc("match_factor_embeddings", {
      query_embedding: embedding,
      match_count: MATCH_COUNT,
    });
    if (error) throw error;

    const rows = (data ?? []) as MatchRow[];
    return rows
      .filter((r) => (r.factor_value ?? 0) > 0)
      .map((r) => {
        const tier = r.source_tier ?? "ecoinvent";
        const candidate: MatchCandidate = {
          source_tier: tier,
          // similaridade 0..1 → score 0..100 para competir com o fuzzball
          score: Math.round((r.similarity ?? 0) * 100),
          factor_value: r.factor_value ?? 0,
          factor_unit: r.factor_unit ?? "",
          product_unit: r.product_unit ?? "",
          factor_name: r.factor_name ?? "",
          factor_source: r.factor_source ?? "",
          geography: "",
        };
        // Liga o id de origem ao campo do tier correto, para dedup correto.
        if (tier === "cecarbon") candidate.cecarbon_id = Number(r.source_id);
        else if (tier === "ghg_protocol") candidate.ghg_factor_id = Number(r.source_id);
        else candidate.ecoinvent_product_id = r.source_id;
        return candidate;
      });
  } catch (e) {
    console.warn(`[factor-vector-search] falhou, seguindo sem RAG: ${e instanceof Error ? e.message : e}`);
    return [];
  }
}
