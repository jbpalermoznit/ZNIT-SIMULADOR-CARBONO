/**
 * Roda a extração de GWP A1-A3 via IA para todos os EPDs do Brasil que ainda
 * não têm o valor no catálogo (backend.epd_dev.gwp_a1a3 = null) — feedback
 * Saint Gobain: "identificar automaticamente o fator de emissão do EPD".
 *
 * Grava tudo em public.epd_ai_extractions com status=pending_review — nada
 * fica utilizável em cálculo até um humano aprovar (ver
 * app/api/emission-factors/epd/[epdId]/review/route.ts ou a UI em
 * app/projects/[projectId]/items/page.tsx, aba "Buscar EPD").
 *
 * Pré-requisitos: migration-v14-epd-ai-extraction.sql aplicada,
 * EPD_EXTRACTION_ENABLED=true e ANTHROPIC_API_KEY no ambiente.
 *
 * Uso:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/extract-epd-gwp-brasil.ts
 */
import { listBrazilEpds } from "../lib/server/supabase-emission";
import {
  extractEpdGwp,
  isEpdExtractionEnabled,
  resolveEpdPdfUrl,
  upsertEpdExtraction,
  getEpdExtraction,
  EPD_EXTRACTION_MODEL,
} from "../lib/server/epd-extraction";

async function main() {
  if (!isEpdExtractionEnabled()) {
    throw new Error(
      "Extração desligada — defina EPD_EXTRACTION_ENABLED=true e ANTHROPIC_API_KEY."
    );
  }

  const epds = await listBrazilEpds();
  console.log(`${epds.length} EPDs do Brasil no catálogo.`);

  const pending = epds.filter((e) => (e.gwp_a1a3 as number | null) == null);
  console.log(`${pending.length} sem gwp_a1a3 — processando com ${EPD_EXTRACTION_MODEL}.\n`);

  let extracted = 0, notFound = 0, noPdf = 0, techFailure = 0, alreadyReviewed = 0;

  for (const epd of pending) {
    const id = epd.id as number;
    const titulo = (epd.titulo as string) ?? `EPD ${id}`;

    const existing = await getEpdExtraction(id);
    if (existing && existing.status !== "pending_review") {
      alreadyReviewed++;
      console.log(`[${id}] "${titulo}" — já revisado (${existing.status}), pulando.`);
      continue;
    }

    const pdfUrl = resolveEpdPdfUrl(epd);
    if (!pdfUrl) {
      noPdf++;
      console.log(`[${id}] "${titulo}" — sem PDF disponível.`);
      continue;
    }

    const result = await extractEpdGwp(pdfUrl);
    if (!result) {
      techFailure++;
      console.log(`[${id}] "${titulo}" — falha técnica (fetch/API).`);
      continue;
    }

    const saved = await upsertEpdExtraction(id, result, EPD_EXTRACTION_MODEL);
    if (!saved.ok) {
      techFailure++;
      console.log(`[${id}] "${titulo}" — falha ao salvar: ${saved.error}`);
      continue;
    }

    if (result.found) {
      extracted++;
      console.log(`[${id}] "${titulo}" — ${result.gwp_a1a3} kgCO2e/${result.declared_unit} (confiança: ${result.confidence})`);
    } else {
      notFound++;
      console.log(`[${id}] "${titulo}" — IA não encontrou A1-A3: ${result.citation}`);
    }
  }

  console.log("\n=== RESUMO ===");
  console.log(`Extraído com valor: ${extracted}`);
  console.log(`Documento sem A1-A3: ${notFound}`);
  console.log(`Sem PDF disponível: ${noPdf}`);
  console.log(`Falha técnica: ${techFailure}`);
  console.log(`Já revisado (pulado): ${alreadyReviewed}`);
  console.log(`Total processado: ${pending.length}`);
  console.log("\nTudo em pending_review — revise e aprove pela UI antes de usar em cálculo.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
