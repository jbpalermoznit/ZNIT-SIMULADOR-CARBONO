/**
 * Cache determinístico das decisões do reranker (Claude).
 *
 * Objetivo: reprodutibilidade. Re-subir o mesmo arquivo deve dar o MESMO total.
 * O LLM não é determinístico, então memoizamos a escolha por
 * (modelo + descrição + unidade + conjunto de candidatos). A chave é um hash
 * estável; o valor é a ASSINATURA do candidato escolhido (não o índice, que
 * depende da ordem do pool).
 *
 * Fallback gracioso: qualquer erro de I/O (tabela ausente, rede) → undefined /
 * no-op, e o chamador simplesmente chama o LLM. Nunca quebra o cálculo.
 */
import { createHash } from "node:crypto";
import { supabase } from "@/lib/server/supabase";
import type { MatchCandidate } from "@/lib/server/emission-mapper";

export interface CachedRerank {
  /** Assinatura do candidato escolhido, ou null quando "nenhum serve". */
  chosenSig: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
}

function normText(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Identidade estável de um candidato — id da fonte quando houver, senão nome. */
export function candidateSig(c: MatchCandidate): string {
  const id =
    c.cecarbon_id ??
    c.ghg_factor_id ??
    c.ecoinvent_product_id ??
    c.ecoinvent_activity_id ??
    c.epd_id ??
    c.epd_registration ??
    c.factor_name;
  return `${c.source_tier}|${id}|${c.factor_value}|${c.factor_unit}`;
}

/**
 * Chave de cache. Inclui o modelo (trocar de modelo invalida o cache) e o
 * conjunto de candidatos ORDENADO (independe da ordem em que vieram).
 */
export function rerankCacheKey(
  model: string,
  description: string,
  unit: string | null | undefined,
  pool: MatchCandidate[],
): string {
  const sigs = pool.map(candidateSig).sort().join("~");
  const raw = `${model}||${normText(description)}||${normText(unit)}||${sigs}`;
  return createHash("sha256").update(raw).digest("hex");
}

export async function getCachedRerank(key: string): Promise<CachedRerank | undefined> {
  try {
    const { data, error } = await supabase
      .from("reranker_cache")
      .select("chosen_sig,confidence,reason")
      .eq("cache_key", key)
      .maybeSingle();
    if (error || !data) return undefined;
    return {
      chosenSig: (data.chosen_sig as string | null) ?? null,
      confidence: data.confidence as CachedRerank["confidence"],
      reason: (data.reason as string | null) ?? "",
    };
  } catch {
    return undefined;
  }
}

export async function putCachedRerank(key: string, v: CachedRerank): Promise<void> {
  try {
    await supabase
      .from("reranker_cache")
      .upsert(
        { cache_key: key, chosen_sig: v.chosenSig, confidence: v.confidence, reason: v.reason },
        { onConflict: "cache_key" },
      );
  } catch {
    /* best-effort — cache não é crítico */
  }
}
