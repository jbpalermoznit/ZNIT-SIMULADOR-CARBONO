import { NextRequest } from "next/server";

/**
 * Autenticação dos endpoints PowerBI (token de serviço, sem usuário Clerk).
 * Aceita `?api_key=<POWERBI_API_KEY>` ou `Authorization: Bearer <POWERBI_API_KEY>`.
 *
 * Regressão travada: a versão antiga aceitava QUALQUER header que começasse
 * com "Bearer " — literalmente `Bearer x` autenticava e expunha os dados de
 * qualquer projeto. O token agora é comparado com a chave configurada, e um
 * ambiente sem POWERBI_API_KEY mantém o endpoint fechado.
 */
export function authenticatePowerBI(req: NextRequest): boolean {
  const expected = process.env.POWERBI_API_KEY;
  if (!expected) return false;
  const apiKey = req.nextUrl.searchParams.get("api_key");
  if (apiKey === expected) return true;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${expected}`;
}

export function powerbiUnauthorized() {
  return Response.json(
    { detail: "API key inválida ou token expirado" },
    { status: 401 }
  );
}
