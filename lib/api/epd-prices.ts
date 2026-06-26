import { api } from "./client";

export interface EpdPriceItem {
  epd_id: number;
  titulo: string;
  manufacturer: string;
  country: string;
  declared_unit: string;
  gwp_a1a3: number | null;
  /** Preço cadastrado pela empresa (R$/unidade declarada), ou null. */
  price: number | null;
  note: string | null;
  updated_at: string | null;
}

export async function searchEpdPrices(
  q: string,
  brazilOnly: boolean
): Promise<EpdPriceItem[]> {
  const params = new URLSearchParams({ q });
  if (brazilOnly) params.set("brazil", "1");
  const r = await api.get<{ results: EpdPriceItem[] }>(`/api/epd-prices?${params}`);
  return r.results;
}

/** Salva preço (por empresa) e/ou GWP (global). Pelo menos um obrigatório. */
export async function saveEpd(
  epdId: number,
  fields: { price?: number; gwp_a1a3?: number; declaredUnit?: string; note?: string }
): Promise<void> {
  await api.put(`/api/epd-prices/${epdId}`, {
    price: fields.price ?? null,
    gwp_a1a3: fields.gwp_a1a3 ?? null,
    declared_unit: fields.declaredUnit ?? null,
    note: fields.note ?? null,
  });
}

export async function clearEpdPrice(epdId: number): Promise<void> {
  await api.delete(`/api/epd-prices/${epdId}`);
}
