/**
 * GET /api/emission-factors/epd/[epdId]
 * Retorna a extração de GWP A1-A3 via IA já existente para o EPD (se houver),
 * pending_review/approved/rejected — para a UI de catálogo mostrar o estado
 * sem precisar re-extrair a cada abertura da tela.
 */
import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { getEpdExtraction } from "@/lib/server/epd-extraction";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ epdId: string }> }
) {
  try {
    await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { epdId } = await params;
  const id = Number(epdId);
  if (!Number.isFinite(id)) {
    return Response.json({ detail: "EPD inválido" }, { status: 400 });
  }

  const extraction = await getEpdExtraction(id);
  return Response.json(extraction);
}
