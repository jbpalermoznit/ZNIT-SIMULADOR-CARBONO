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

/** Lista todos os EPDs do Brasil (country contém Brazil/Brasil). Pool pequeno (~90). */
export async function listBrazilEpds(limit = 500) {
  const { data, error } = await supabaseEmission
    .from("epd_dev")
    .select("*")
    .or("country.ilike.%brazil%,country.ilike.%brasil%")
    .order("titulo")
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Busca EPDs do catálogo por ids (para aplicar o GWP manual por empresa). */
export async function getEpdsByIds(ids: number[]) {
  if (ids.length === 0) return [];
  const { data, error } = await supabaseEmission
    .from("epd_dev")
    .select("*")
    .in("id", ids);
  if (error) return [];
  return data ?? [];
}
