/**
 * PUT/DELETE /api/epd-prices/[epdId]
 * Registra/atualiza (preço + unidade + GWP) ou limpa o preço de um EPD para a
 * empresa do usuário. Tudo POR EMPRESA (org).
 */
import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import {
  upsertCompanyEpd,
  clearCompanyEpdPrice,
} from "@/lib/server/epd-prices";
import type { AuthUser } from "@/lib/server/auth";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ epdId: string }> }
) {
  let user: AuthUser;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { epdId } = await params;
  const id = Number(epdId);
  if (!Number.isFinite(id)) {
    return Response.json({ detail: "EPD inválido" }, { status: 400 });
  }

  const body = await req.json();
  const hasPrice = body.price != null && body.price !== "";
  const hasGwp = body.gwp_a1a3 != null && body.gwp_a1a3 !== "";
  if (!hasPrice && !hasGwp) {
    return Response.json({ detail: "Informe preço e/ou GWP." }, { status: 400 });
  }

  let price: number | null = null;
  if (hasPrice) {
    price = Number(body.price);
    if (!Number.isFinite(price) || price <= 0) {
      return Response.json({ detail: "Preço inválido (> 0)." }, { status: 400 });
    }
  }
  let gwp: number | null = null;
  if (hasGwp) {
    gwp = Number(body.gwp_a1a3);
    if (!Number.isFinite(gwp) || gwp <= 0) {
      return Response.json({ detail: "GWP inválido (> 0)." }, { status: 400 });
    }
  }

  const res = await upsertCompanyEpd({
    companyId: user.company_id,
    epdId: id,
    price,
    priceUnit: body.price_unit ?? null,
    gwp,
    declaredUnit: body.declared_unit ?? null,
    note: body.note ?? null,
    updatedBy: user.id,
  });
  if (!res.ok) {
    return Response.json(
      { detail: res.error ?? "Erro ao salvar (a tabela epd_prices existe? aplique migration-v10)" },
      { status: 400 }
    );
  }
  return Response.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ epdId: string }> }
) {
  let user: AuthUser;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }
  const { epdId } = await params;
  const id = Number(epdId);
  if (!Number.isFinite(id)) {
    return Response.json({ detail: "EPD inválido" }, { status: 400 });
  }
  const res = await clearCompanyEpdPrice(user.company_id, id);
  if (!res.ok) return Response.json({ detail: res.error }, { status: 400 });
  return Response.json({ ok: true });
}
