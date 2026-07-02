import { describe, it, expect, vi, beforeEach } from "vitest";

// ===========================================================================
// DELETE /api/scenarios/[scenarioId] — guard do cenário Base + fluxo de auth.
// ===========================================================================
//
// Regressão para o guard adicionado na PR de UX de upload: o cenário Base é a
// referência de toda comparação e NÃO pode ser excluído (retorna 400 e não
// toca em nenhuma tabela). Cenários não-base seguem apagando results → items →
// scenario, nessa ordem. Auth/ownership continuam curto-circuitando antes de
// qualquer delete.
//
// Tudo mockado (supabase, auth, access) — sem DB real, roda em CI.

const h = vi.hoisted(() => {
  class ForbiddenError extends Error {}
  return {
    ForbiddenError,
    state: {
      scenarioRow: { is_base: false } as { is_base: boolean } | null,
      deletes: [] as string[],
    },
  };
});

vi.mock("@/lib/server/supabase", () => ({
  supabase: {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({ data: h.state.scenarioRow, error: null }),
        delete: () => ({
          eq: async () => {
            h.state.deletes.push(table);
            return { error: null };
          },
        }),
      };
      return chain;
    },
  },
}));

vi.mock("@/lib/server/auth", () => ({
  getCurrentUser: vi.fn(),
  unauthorized: (m = "Autenticação necessária") =>
    Response.json({ detail: m }, { status: 401 }),
}));

vi.mock("@/lib/server/access", () => ({
  ForbiddenError: h.ForbiddenError,
  assertScenarioOwnership: vi.fn(),
  forbidden: (m = "Acesso negado") => Response.json({ detail: m }, { status: 403 }),
}));

import { DELETE } from "@/app/api/scenarios/[scenarioId]/route";
import { getCurrentUser } from "@/lib/server/auth";
import { assertScenarioOwnership, ForbiddenError } from "@/lib/server/access";

const fakeUser = {
  id: "u1",
  company_id: "c1",
  name: "Tester",
  email: "t@znit.ai",
  role: "admin",
  is_active: true,
  clerk_user_id: "ck1",
  clerk_org_id: "org1",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = {} as any;
const ctx = { params: Promise.resolve({ scenarioId: "s1" }) };

beforeEach(() => {
  h.state.scenarioRow = { is_base: false };
  h.state.deletes = [];
  vi.mocked(getCurrentUser).mockResolvedValue(fakeUser);
  vi.mocked(assertScenarioOwnership).mockResolvedValue({ projectId: "proj-1" });
});

describe("DELETE scenario — guard do cenário Base", () => {
  it("recusa excluir o cenário Base (400) e não toca em nenhuma tabela", async () => {
    h.state.scenarioRow = { is_base: true };

    const res = await DELETE(req, ctx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toMatch(/Base não pode ser exclu/i);
    expect(h.state.deletes).toEqual([]);
  });

  it("exclui cenário não-base: results → items → scenarios, retorna 204", async () => {
    h.state.scenarioRow = { is_base: false };

    const res = await DELETE(req, ctx);

    expect(res.status).toBe(204);
    expect(h.state.deletes).toEqual([
      "scenario_results",
      "scenario_items",
      "scenarios",
    ]);
  });
});

describe("DELETE scenario — auth/ownership curto-circuitam antes do delete", () => {
  it("sem autenticação → 401 e nenhum delete", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error("no session"));

    const res = await DELETE(req, ctx);

    expect(res.status).toBe(401);
    expect(h.state.deletes).toEqual([]);
  });

  it("cenário de outra empresa → 403 e nenhum delete", async () => {
    vi.mocked(assertScenarioOwnership).mockRejectedValue(
      new ForbiddenError("Access denied")
    );

    const res = await DELETE(req, ctx);

    expect(res.status).toBe(403);
    expect(h.state.deletes).toEqual([]);
  });
});
