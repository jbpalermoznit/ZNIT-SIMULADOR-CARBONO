/**
 * PUT/DELETE /api/epd-prices/[epdId]
 * Cadastra/atualiza ou remove o preço de um EPD para a empresa do usuário.
 */
import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import {
  upsertCompanyEpdPrice,
  deleteCompanyEpdPrice,
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
  const price = Number(body.price);
  if (!Number.isFinite(price) || price <= 0) {
    return Response.json({ detail: "Preço inválido" }, { status: 400 });
  }

  const res = await upsertCompanyEpdPrice({
    companyId: user.company_id,
    epdId: id,
    price,
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
  const res = await deleteCompanyEpdPrice(user.company_id, id);
  if (!res.ok) return Response.json({ detail: res.error }, { status: 400 });
  return Response.json({ ok: true });
}
