/**
 * GET /api/epd-prices?q=<busca>&brazil=1
 * Busca EPDs no catálogo e mescla o preço cadastrado pela empresa do usuário.
 * `brazil=1` filtra só EPDs do Brasil.
 */
import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { searchEpdCatalog, listBrazilEpds } from "@/lib/server/supabase-emission";
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
  // Sem busca: se "Só Brasil", lista TODOS os EPDs do Brasil (pool pequeno);
  // senão, exige um termo (o catálogo global tem ~17 mil).
  if (!q && !brazilOnly) return Response.json({ results: [] });

  let rows: Record<string, unknown>[] = [];
  try {
    if (!q) {
      rows = await listBrazilEpds(500); // todos do Brasil
    } else {
      rows = await searchEpdCatalog(q, 50);
      if (brazilOnly) {
        rows = rows.filter((r) => {
          const c = String(r.country ?? r.geographical_scopes ?? "").toLowerCase();
          return c.includes("brazil") || c.includes("brasil");
        });
      }
    }
  } catch {
    return Response.json({ results: [] });
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

  // EPDs com GWP primeiro (são os que viram alternativa nas Recomendações);
  // entre os com GWP, os já com preço cadastrado no topo.
  results.sort((a, b) => {
    const ga = a.gwp_a1a3 != null ? 1 : 0;
    const gb = b.gwp_a1a3 != null ? 1 : 0;
    if (ga !== gb) return gb - ga;
    const pa = a.price != null ? 1 : 0;
    const pb = b.price != null ? 1 : 0;
    return pb - pa;
  });

  return Response.json({ results });
}
