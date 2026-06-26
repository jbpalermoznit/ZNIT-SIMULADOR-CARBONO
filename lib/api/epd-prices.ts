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

export async function setEpdPrice(
  epdId: number,
  price: number,
  declaredUnit?: string,
  note?: string
): Promise<void> {
  await api.put(`/api/epd-prices/${epdId}`, {
    price,
    declared_unit: declaredUnit ?? null,
    note: note ?? null,
  });
}

export async function clearEpdPrice(epdId: number): Promise<void> {
  await api.delete(`/api/epd-prices/${epdId}`);
}
