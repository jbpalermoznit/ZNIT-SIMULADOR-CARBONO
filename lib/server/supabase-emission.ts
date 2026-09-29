/**
 * Emission factor queries against Supabase "backend" schema.
 * Replaces backend/app/core/supabase_client.py
 */
import * as fuzz from "fuzzball";
import { supabaseEmission } from "./supabase";

/**
 * Busca tolerante a erro de grafia.
 *
 * O `ilike %termo%` é exato em substring: "pontelete" não acha "PONTALETE"
 * (uma letra trocada no meio) — reportado pelo cliente como "a barra de
 * pesquisa não localiza os nomes dos materiais". Quando a busca direta vem
 * vazia, relaxa para um prefixo curto (que ainda casa: "pont"), puxa um pool
 * maior de candidatos e reordena por similaridade contra o termo original.
 *
 * Só roda no caminho vazio — buscas que já acham algo não mudam de
 * comportamento nem pagam a query extra.
 */
const FUZZY_MIN_QUERY = 5;
const FUZZY_PREFIX_LEN = 4;
const FUZZY_POOL = 300;
const FUZZY_THRESHOLD = 72;

async function fuzzyFallback<T extends Record<string, unknown>>(
  query: string,
  fetchByTerm: (term: string, limit: number) => Promise<T[]>,
  nameFields: (row: T) => Array<unknown>,
  limit: number
): Promise<T[]> {
  if (query.length < FUZZY_MIN_QUERY) return [];
  const prefix = query.slice(0, FUZZY_PREFIX_LEN);
  const pool = await fetchByTerm(prefix, FUZZY_POOL);
  const needle = query.toLowerCase();
  return pool
    .map((row) => {
      const best = Math.max(
        ...nameFields(row)
          .filter((v): v is string => typeof v === "string" && v.length > 0)
          .map((v) => fuzz.partial_ratio(needle, v.toLowerCase())),
        0
      );
      return { row, score: best };
    })
    .filter((s) => s.score >= FUZZY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.row);
}

async function ecoinventByTerm(term: string, limit: number) {
  const { data, error } = await supabaseEmission
    .from("ecoinvent_dev")
    .select("*")
    .or(
      `product_name.ilike.%${term}%,product_name_pt.ilike.%${term}%,activity_name.ilike.%${term}%,activity_name_pt.ilike.%${term}%`
    )
    .order("product_name")
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function searchEcoinvent(query: string, limit = 20) {
  const direct = await ecoinventByTerm(query, limit);
  if (direct.length > 0) return direct;
  return fuzzyFallback(
    query,
    ecoinventByTerm,
    (r) => [r.product_name, r.product_name_pt, r.activity_name, r.activity_name_pt],
    limit
  );
}

async function ghgByTerm(term: string, limit: number) {
  const { data, error } = await supabaseEmission
    .from("fatores_ghg_dev")
    .select("*")
    .ilike("produto", `%${term}%`)
    .order("produto")
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function searchGhg(query: string, limit = 20) {
  const direct = await ghgByTerm(query, limit);
  if (direct.length > 0) return direct;
  return fuzzyFallback(query, ghgByTerm, (r) => [r.produto], limit);
}

async function epdCatalogByTerm(term: string, limit: number) {
  const { data, error } = await supabaseEmission
    .from("epd_dev")
    .select("*")
    .or(
      `titulo.ilike.%${term}%,informacao_produto.ilike.%${term}%,company_name.ilike.%${term}%`
    )
    .order("titulo")
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function searchEpdCatalog(query: string, limit = 20) {
  const direct = await epdCatalogByTerm(query, limit);
  if (direct.length > 0) return direct;
  return fuzzyFallback(query, epdCatalogByTerm, (r) => [r.titulo, r.company_name], limit);
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

async function cecarbonByTerm(term: string, limit: number) {
  const { data, error } = await supabaseEmission
    .from("produtos_cecarbon_dev")
    .select("*")
    .ilike("Descrição fator de emissao", `%${term}%`)
    .order("Descrição fator de emissao")
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function searchCecarbon(query: string, limit = 20) {
  const direct = await cecarbonByTerm(query, limit);
  if (direct.length > 0) return direct;
  return fuzzyFallback(
    query,
    cecarbonByTerm,
    (r) => [r["Descrição fator de emissao"]],
    limit
  );
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
