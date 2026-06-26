/**
 * GET /api/epd-prices?q=<busca>&brazil=1
 * Busca EPDs no catálogo e mescla o preço cadastrado pela empresa do usuário.
 * `brazil=1` filtra só EPDs do Brasil.
 */
import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { searchEpdCatalog } from "@/lib/server/supabase-emission";
import { getCompanyEpdPrices } from "@/lib/server/epd-prices";
import type { AuthUser } from "@/lib/server/auth";

export async function GET(req: NextRequest) {
  let user: AuthUser;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const brazilOnly = searchParams.get("brazil") === "1";
  if (!q) return Response.json({ results: [] });

  let rows: Record<string, unknown>[] = [];
  try {
    rows = await searchEpdCatalog(q, 50);
  } catch {
    return Response.json({ results: [] });
  }

  if (brazilOnly) {
    rows = rows.filter((r) => {
      const c = String(r.country ?? r.geographical_scopes ?? "").toLowerCase();
      return c.includes("brazil") || c.includes("brasil");
    });
  }

  const ids = rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
  const prices = await getCompanyEpdPrices(user.company_id, ids);

  const results = rows.map((r) => {
    const id = Number(r.id);
    const p = prices.get(id);
    return {
      epd_id: id,
      titulo: (r.titulo as string) ?? "",
      manufacturer: (r.company_name as string) ?? "",
      country: (r.country as string) ?? (r.geographical_scopes as string) ?? "",
      declared_unit: String(r.declared_unit ?? "").trim(),
      gwp_a1a3: (r.gwp_a1a3 as number) ?? null,
      price: p?.price_per_declared_unit ?? null,
      note: p?.note ?? null,
      updated_at: p?.updated_at ?? null,
    };
  });

  return Response.json({ results });
}
