import { describe, it, expect, vi, beforeEach } from "vitest";

// ===========================================================================
// uploadAbc / uploadScenario — payload do FormData + threading do AbortSignal.
// ===========================================================================
//
// Regressão para o cancelamento de upload (AbortController) adicionado na PR de
// UX: a página de import e o dialog criam um controller por upload e esperam
// que o signal chegue até o fetch. Aqui travamos que as funções de API montam o
// FormData correto E repassam o AbortSignal como 3º argumento de postForm.

vi.mock("@/lib/api/client", () => ({
  api: { postForm: vi.fn().mockResolvedValue({}) },
}));

import { uploadAbc, uploadScenario } from "@/lib/api/projects";
import { api } from "@/lib/api/client";

const postForm = vi.mocked(api.postForm);

beforeEach(() => {
  postForm.mockReset().mockResolvedValue({} as never);
});

const xlsx = (name: string) =>
  new File(["binary"], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

describe("uploadAbc — FormData + AbortSignal", () => {
  it("repassa o AbortSignal como 3º argumento de postForm", async () => {
    const controller = new AbortController();
    await uploadAbc("p1", xlsx("abc.xlsx"), { signal: controller.signal });

    expect(postForm).toHaveBeenCalledTimes(1);
    const [path, , signal] = postForm.mock.calls[0];
    expect(path).toBe("/api/projects/p1/upload-abc");
    expect(signal).toBe(controller.signal);
  });

  it("monta o FormData com o arquivo e as flags de cenário", async () => {
    await uploadAbc("p1", xlsx("abc.xlsx"), {
      scenarioName: "Cenário B",
      asScenario: true,
    });

    const form = postForm.mock.calls[0][1] as FormData;
    expect((form.get("file") as File).name).toBe("abc.xlsx");
    expect(form.get("scenario_name")).toBe("Cenário B");
    expect(form.get("as_scenario")).toBe("true");
  });

  it("sem signal, o 3º argumento é undefined (não quebra o fetch)", async () => {
    await uploadAbc("p1", xlsx("abc.xlsx"));
    expect(postForm.mock.calls[0][2]).toBeUndefined();
  });

  it("inclui os arquivos opcionais de enriquecimento quando fornecidos", async () => {
    await uploadAbc("p1", xlsx("abc.xlsx"), {
      costCodesFile: xlsx("costcodes.xlsx"),
      proofFile: xlsx("proof.xlsx"),
    });

    const form = postForm.mock.calls[0][1] as FormData;
    expect((form.get("cost_codes_file") as File).name).toBe("costcodes.xlsx");
    expect((form.get("proof_file") as File).name).toBe("proof.xlsx");
  });
});

describe("uploadScenario — FormData + AbortSignal", () => {
  it("repassa o AbortSignal e monta itens + insumos + nome", async () => {
    const controller = new AbortController();
    await uploadScenario(
      "p2",
      xlsx("itens.xlsx"),
      xlsx("insumos.xlsx"),
      "Cenário Completo",
      controller.signal
    );

    const [path, form, signal] = postForm.mock.calls[0] as [string, FormData, AbortSignal];
    expect(path).toBe("/api/projects/p2/upload-scenario");
    expect((form.get("items_file") as File).name).toBe("itens.xlsx");
    expect((form.get("insumos_file") as File).name).toBe("insumos.xlsx");
    expect(form.get("scenario_name")).toBe("Cenário Completo");
    expect(signal).toBe(controller.signal);
  });

  it("signal é opcional — undefined quando omitido", async () => {
    await uploadScenario("p2", xlsx("itens.xlsx"), xlsx("insumos.xlsx"), "X");
    expect(postForm.mock.calls[0][2]).toBeUndefined();
  });
});
