/**
 * Gemini AI client via n8n webhook.
 * Replaces backend/app/core/gemini_client.py
 */

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL ?? "https://orchestration.znit.ai/webhook/ocr-gemini";
const TIMEOUT_MS = 120_000;

export async function callGemini(instrucoes: string): Promise<Record<string, unknown>> {
  const fileBlob = new Blob([instrucoes], { type: "text/plain" });

  const form = new FormData();
  form.append("instrucoes", "Analise o documento de texto anexo e responda EXCLUSIVAMENTE em formato JSON conforme as instruções contidas nele. Não inclua texto fora do JSON.");
  form.append("file", fileBlob, "context.txt");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Gemini webhook retornou status ${res.status}: ${text.slice(0, 500)}`);
    }

    const data = await res.json();

    if (data?.sucesso === false) {
      throw new Error(`Gemini falhou: ${JSON.stringify(data).slice(0, 500)}`);
    }

    let resultado = data?.resultado ?? data;

    if (typeof resultado === "string") {
      let cleaned = resultado.trim();
      if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
      if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
      if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
      cleaned = cleaned.trim();
      try {
        return JSON.parse(cleaned);
      } catch {
        return { text: resultado };
      }
    }

    return resultado;
  } finally {
    clearTimeout(timer);
  }
}
