/**
 * Emission factor queries against Supabase "backend" schema.
 * Replaces backend/app/core/supabase_client.py
 */
import { supabaseEmission } from "./supabase";

export async function searchEcoinvent(query: string, limit = 20) {
  const { data, error } = await supabaseEmission
    .from("ecoinvent_dev")
    .select("*")
    .or(
      `product_name.ilike.%${query}%,product_name_pt.ilike.%${query}%,activity_name.ilike.%${query}%,activity_name_pt.ilike.%${query}%`
    )
    .order("product_name")
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function searchGhg(query: string, limit = 20) {
  const { data, error } = await supabaseEmission
    .from("fatores_ghg_dev")
    .select("*")
    .ilike("produto", `%${query}%`)
    .order("produto")
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function searchEpdCatalog(query: string, limit = 20) {
  const { data, error } = await supabaseEmission
    .from("epd_dev")
    .select("*")
    .or(
      `titulo.ilike.%${query}%,informacao_produto.ilike.%${query}%,company_name.ilike.%${query}%`
    )
    .order("titulo")
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function searchEpdWithGwp(query: string, limit = 20) {
  const { data, error } = await supabaseEmission
    .from("epd_dev")
    .select("*")
    .or(
      `titulo.ilike.%${query}%,informacao_produto.ilike.%${query}%,company_name.ilike.%${query}%`
    )
    .not("gwp_a1a3", "is", null)
    .order("titulo")
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getEpdById(rowId: number) {
  const { data, error } = await supabaseEmission
    .from("epd_dev")
    .select("*")
    .eq("id", rowId)
    .limit(1)
    .single();
  if (error) return null;
  return data;
}

export async function getEcoinventById(productId: string, activityId: string) {
  const { data, error } = await supabaseEmission
    .from("ecoinvent_dev")
    .select("*")
    .eq("product_id", productId)
    .eq("activity_id", activityId)
    .limit(1)
    .single();
  if (error) return null;
  return data;
}

export async function getGhgById(rowId: number) {
  const { data, error } = await supabaseEmission
    .from("fatores_ghg_dev")
    .select("*")
    .eq("id", rowId)
    .limit(1)
    .single();
  if (error) return null;
  return data;
}

export async function getGhgLatest(produto: string) {
  const { data, error } = await supabaseEmission
    .from("fatores_ghg_dev")
    .select("*")
    .eq("produto", produto)
    .order("ano", { ascending: false })
    .limit(1)
    .single();
  if (error) return null;
  return data;
}

export async function searchCecarbon(query: string, limit = 20) {
  const { data, error } = await supabaseEmission
    .from("produtos_cecarbon_dev")
    .select("*")
    .ilike("Descrição fator de emissao", `%${query}%`)
    .order("Descrição fator de emissao")
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getCecarbonById(rowId: number) {
  const { data, error } = await supabaseEmission
    .from("produtos_cecarbon_dev")
    .select("*")
    .eq("id", rowId)
    .limit(1)
    .single();
  if (error) return null;
  return data;
}

// ---------------------------------------------------------------------------
// Cache de estimativas de preço de mercado (backend.price_estimates)
// Suporta o ROI das recomendações de redução. Ver migration-v9-epd-price.sql.
// ---------------------------------------------------------------------------

export interface CachedPriceEstimate {
  price: number;
  currency: string;
  unit: string;
  source_name: string | null;
  source_url: string | null;
  as_of: string | null;
  confidence: "high" | "medium" | "low";
}

/** Lê a estimativa cacheada para (material, região, unidade, período) ou null. */
export async function getCachedPriceEstimate(
  materialKey: string,
  region: string,
  unit: string,
  period: string
): Promise<CachedPriceEstimate | null> {
  const { data, error } = await supabaseEmission
    .from("price_estimates")
    .select("price, currency, unit, source_name, source_url, as_of, confidence")
    .eq("material_key", materialKey)
    .eq("region", region)
    .eq("unit", unit)
    .eq("period", period)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as CachedPriceEstimate;
}

/** Grava (upsert) uma estimativa no cache. Falha silenciosa (não bloqueia). */
export async function upsertPriceEstimate(row: {
  material_key: string;
  region: string;
  unit: string;
  period: string;
  price: number;
  currency: string;
  source_name: string | null;
  source_url: string | null;
  as_of: string | null;
  confidence: string;
}): Promise<void> {
  const { error } = await supabaseEmission
    .from("price_estimates")
    .upsert(row, { onConflict: "material_key,region,unit,period" });
  if (error) console.warn(`[price-cache] upsert falhou: ${error.message}`);
}
