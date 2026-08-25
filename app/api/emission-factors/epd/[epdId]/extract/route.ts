/**
 * POST /api/emission-factors/epd/[epdId]/extract
 * Roda a extração de GWP A1-A3 via IA sobre o PDF do EPD e grava o resultado
 * em pending_review — nunca escreve valor usável em cálculo direto (ver
 * lib/server/epd-extraction.ts). Idempotente/rerodável: cada chamada
 * substitui a extração anterior e volta a pending_review.
 */
import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { getEpdById } from "@/lib/server/supabase-emission";
import {
  extractEpdGwp,
  isEpdExtractionEnabled,
  resolveEpdPdfUrl,
  upsertEpdExtraction,
  getEpdExtraction,
  EPD_EXTRACTION_MODEL,
} from "@/lib/server/epd-extraction";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ epdId: string }> }
) {
  try {
    await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  if (!isEpdExtractionEnabled()) {
    return Response.json(
      { detail: "Extração via IA desligada (EPD_EXTRACTION_ENABLED / ANTHROPIC_API_KEY)" },
      { status: 400 }
    );
  }

  const { epdId } = await params;
  const id = Number(epdId);
  if (!Number.isFinite(id)) {
    return Response.json({ detail: "EPD inválido" }, { status: 400 });
  }

  const row = await getEpdById(id);
  if (!row) return Response.json({ detail: "EPD não encontrado" }, { status: 404 });

  const pdfUrl = resolveEpdPdfUrl(row);
  if (!pdfUrl) {
    return Response.json(
      { detail: "EPD sem PDF disponível (old_link e pdf_url ausentes)" },
      { status: 400 }
    );
  }

  const result = await extractEpdGwp(pdfUrl);
  if (!result) {
    return Response.json(
      { detail: "Falha técnica ao processar o PDF (fetch/API) — tente novamente" },
      { status: 502 }
    );
  }

  const saved = await upsertEpdExtraction(id, result, EPD_EXTRACTION_MODEL);
  if (!saved.ok) {
    return Response.json(
      { detail: saved.error ?? "Erro ao salvar extração (aplique migration-v14)" },
      { status: 400 }
    );
  }

  const extraction = await getEpdExtraction(id);
  return Response.json(extraction);
}
