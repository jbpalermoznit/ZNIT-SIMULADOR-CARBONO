"""
Gemini AI client via n8n webhook.
Same pattern as znit-data-processing-esg/src/lib/ocrGeminiClient.ts
"""

import json
import httpx
from app.core.config import settings

TIMEOUT = 120.0  # seconds


async def call_gemini(instrucoes: str) -> dict:
    """
    POST para n8n webhook com instruções como arquivo .txt.
    O nó Gemini Binary lê o texto e responde em JSON.
    """
    file_bytes = instrucoes.encode("utf-8")

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        response = await client.post(
            settings.N8N_WEBHOOK_URL,
            data={"instrucoes": "Analise o documento de texto anexo e responda EXCLUSIVAMENTE em formato JSON conforme as instruções contidas nele. Não inclua texto fora do JSON."},
            files={"file": ("context.txt", file_bytes, "text/plain")},
        )

    if response.status_code != 200:
        raise RuntimeError(
            f"Gemini webhook retornou status {response.status_code}: "
            f"{response.text[:500]}"
        )

    data = response.json()

    if data.get("sucesso") is False:
        raise RuntimeError(
            f"Gemini falhou: {json.dumps(data)[:500]}"
        )

    resultado = data.get("resultado", data)

    # resultado pode ser string JSON ou dict
    if isinstance(resultado, str):
        cleaned = resultado.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            return {"text": resultado}

    return resultado


def call_gemini_sync(instrucoes: str) -> dict:
    """Sync wrapper for use in non-async contexts."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(
                    asyncio.run, call_gemini(instrucoes)
                ).result()
        return loop.run_until_complete(call_gemini(instrucoes))
    except RuntimeError:
        return asyncio.run(call_gemini(instrucoes))
