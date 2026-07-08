import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { authenticatePowerBI } from "@/lib/server/powerbi-auth";

// ===========================================================================
// PowerBI auth — regressão do bypass "Bearer qualquer-coisa".
// A versão antiga aceitava qualquer Authorization que começasse com
// "Bearer ", expondo itens/emissões de qualquer projeto sem credencial.
// ===========================================================================

const KEY = "test-powerbi-key-123";

function reqWith(opts: { query?: string; bearer?: string }): NextRequest {
  const url = `http://localhost/api/projects/p1/powerbi/items${opts.query ? `?api_key=${opts.query}` : ""}`;
  const headers: Record<string, string> = {};
  if (opts.bearer !== undefined) headers.authorization = `Bearer ${opts.bearer}`;
  return new NextRequest(url, { headers });
}

describe("authenticatePowerBI", () => {
  const original = process.env.POWERBI_API_KEY;
  beforeEach(() => {
    process.env.POWERBI_API_KEY = KEY;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.POWERBI_API_KEY;
    else process.env.POWERBI_API_KEY = original;
  });

  it("aceita api_key correto na query", () => {
    expect(authenticatePowerBI(reqWith({ query: KEY }))).toBe(true);
  });

  it("aceita Bearer com o token correto", () => {
    expect(authenticatePowerBI(reqWith({ bearer: KEY }))).toBe(true);
  });

  it("REJEITA Bearer com token errado (regressão do bypass)", () => {
    expect(authenticatePowerBI(reqWith({ bearer: "x" }))).toBe(false);
  });

  it("rejeita api_key errado e requisição sem credencial", () => {
    expect(authenticatePowerBI(reqWith({ query: "errada" }))).toBe(false);
    expect(authenticatePowerBI(reqWith({}))).toBe(false);
  });

  it("endpoint fica FECHADO quando POWERBI_API_KEY não está configurada", () => {
    delete process.env.POWERBI_API_KEY;
    expect(authenticatePowerBI(reqWith({ bearer: "" }))).toBe(false);
    expect(authenticatePowerBI(reqWith({ query: "" }))).toBe(false);
    expect(authenticatePowerBI(reqWith({}))).toBe(false);
  });
});
