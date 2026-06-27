/**
 * Registro de EPD POR EMPRESA (public.epd_prices): preço (R$/price_unit) e/ou
 * GWP A1-A3 que a própria organização preencheu. Ambos valem só para a empresa.
 * A rota de Recomendações usa esses valores na substituição. Ver migration-v10.
 *
 * Degrada gracioso se a tabela não existir (vazio / no-op).
 */
import { supabase } from "@/lib/server/supabase";

export interface EpdRegistryRow {
  epd_id: number;
  price: number | null;
  price_unit: string | null;
  declared_unit: string | null;
  gwp_a1a3: number | null;
  note: string | null;
  updated_at: string;
}

function mapRow(r: Record<string, unknown>): EpdRegistryRow {
  return {
    epd_id: Number(r.epd_id),
    price: (r.price_per_declared_unit as number) ?? null,
    price_unit: (r.price_unit as string) ?? null,
    declared_unit: (r.declared_unit as string) ?? null,
    gwp_a1a3: (r.gwp_a1a3 as number) ?? null,
    note: (r.note as string) ?? null,
    updated_at: r.updated_at as string,
  };
}

/** Todas as linhas registradas pela empresa (poucas). Map epd_id → row. */
export async function getCompanyEpdRegistry(
  companyId: string
): Promise<Map<number, EpdRegistryRow>> {
  const out = new Map<number, EpdRegistryRow>();
  if (!companyId) return out;
  const { data, error } = await supabase
    .from("epd_prices")
    .select("*")
    .eq("company_id", companyId);
  if (error || !data) return out; // tabela ausente / erro → vazio
  for (const r of data) out.set(Number(r.epd_id), mapRow(r));
  return out;
}

/** Cria/atualiza preço e/ou GWP de um EPD para a empresa (estado completo). */
export async function upsertCompanyEpd(input: {
  companyId: string;
  epdId: number;
  price?: number | null;
  priceUnit?: string | null;
  gwp?: number | null;
  declaredUnit?: string | null;
  note?: string | null;
  updatedBy?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("epd_prices").upsert(
    {
      company_id: input.companyId,
      epd_id: input.epdId,
      price_per_declared_unit: input.price ?? null,
      price_unit: input.priceUnit ?? null,
      declared_unit: input.declaredUnit ?? null,
      gwp_a1a3: input.gwp ?? null,
      note: input.note ?? null,
      updated_by: input.updatedBy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,epd_id" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Limpa o PREÇO (mantém o GWP) de um EPD para a empresa. */
export async function clearCompanyEpdPrice(
  companyId: string,
  epdId: number
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("epd_prices")
    .update({ price_per_declared_unit: null, price_unit: null, updated_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("epd_id", epdId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
