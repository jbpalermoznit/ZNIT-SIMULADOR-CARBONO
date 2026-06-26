/**
 * Cadastro de preços de EPD POR EMPRESA (public.epd_prices).
 *
 * Cada empresa preenche o preço (R$/unidade declarada) dos EPDs que usa; a rota
 * de Recomendações usa esse preço na substituição. Ver migration-v10-epd-prices.sql.
 *
 * Degrada gracioso se a tabela não existir (retorna vazio / no-op) — não quebra
 * o app antes da migração ser aplicada.
 */
import { supabase } from "@/lib/server/supabase";

export interface EpdPriceRow {
  epd_id: number;
  price_per_declared_unit: number;
  declared_unit: string | null;
  note: string | null;
  updated_at: string;
}

/** Mapa epd_id → preço (na unidade declarada) para uma empresa. */
export async function getCompanyEpdPrices(
  companyId: string,
  epdIds: number[]
): Promise<Map<number, EpdPriceRow>> {
  const out = new Map<number, EpdPriceRow>();
  if (!companyId || epdIds.length === 0) return out;
  const { data, error } = await supabase
    .from("epd_prices")
    .select("epd_id, price_per_declared_unit, declared_unit, note, updated_at")
    .eq("company_id", companyId)
    .in("epd_id", epdIds);
  if (error || !data) return out; // tabela ausente / erro → vazio
  for (const r of data) out.set(Number(r.epd_id), r as EpdPriceRow);
  return out;
}

/** Lista todos os preços cadastrados pela empresa (para a tela de cadastro). */
export async function listCompanyEpdPrices(
  companyId: string
): Promise<Map<number, EpdPriceRow>> {
  const out = new Map<number, EpdPriceRow>();
  if (!companyId) return out;
  const { data, error } = await supabase
    .from("epd_prices")
    .select("epd_id, price_per_declared_unit, declared_unit, note, updated_at")
    .eq("company_id", companyId);
  if (error || !data) return out;
  for (const r of data) out.set(Number(r.epd_id), r as EpdPriceRow);
  return out;
}

/** Cria/atualiza o preço de um EPD para a empresa. */
export async function upsertCompanyEpdPrice(input: {
  companyId: string;
  epdId: number;
  price: number;
  declaredUnit?: string | null;
  note?: string | null;
  updatedBy?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("epd_prices").upsert(
    {
      company_id: input.companyId,
      epd_id: input.epdId,
      price_per_declared_unit: input.price,
      declared_unit: input.declaredUnit ?? null,
      note: input.note ?? null,
      updated_by: input.updatedBy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,epd_id" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Remove o preço cadastrado (limpa). */
export async function deleteCompanyEpdPrice(
  companyId: string,
  epdId: number
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("epd_prices")
    .delete()
    .eq("company_id", companyId)
    .eq("epd_id", epdId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
