/**
 * POST /api/emission-factors/epd/[epdId]/review
 * Aprova ou rejeita a extração de GWP A1-A3 via IA pendente para o EPD.
 * Body: { approve: boolean }. Só extrações status=approved entram na
 * cascata de resolução de fator (ver mapping/[itemId]/route.ts).
 */
import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { getEpdExtraction, reviewEpdExtraction } from "@/lib/server/epd-extraction";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ epdId: string }> }
) {
  let user;
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
  if (typeof body.approve !== "boolean") {
    return Response.json({ detail: "approve (boolean) obrigatório" }, { status: 400 });
  }

  const existing = await getEpdExtraction(id);
  if (!existing) {
    return Response.json({ detail: "Nenhuma extração pendente para este EPD" }, { status: 404 });
  }

  const res = await reviewEpdExtraction(id, body.approve, user.name || user.email);
  if (!res.ok) {
    return Response.json({ detail: res.error ?? "Erro ao revisar extração" }, { status: 400 });
  }

  const updated = await getEpdExtraction(id);
  return Response.json(updated);
}
