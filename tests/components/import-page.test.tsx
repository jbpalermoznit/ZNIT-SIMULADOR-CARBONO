// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ projectId: "p1" }),
}));
vi.mock("@/lib/api/projects", () => ({
  getProject: vi.fn().mockResolvedValue({ name: "Projeto Teste" }),
  uploadAbc: vi.fn(),
  uploadScenario: vi.fn(),
}));

import ImportPage from "@/app/projects/[projectId]/import/page";
import { uploadScenario } from "@/lib/api/projects";

const xlsx = (name: string) => new File(["x"], name);

beforeEach(() => {
  push.mockReset();
  vi.mocked(uploadScenario).mockReset();
});

describe("ImportPage — Cenário Completo, drag-and-drop (#1)", () => {
  it("aceita arquivo solto na 'Planilha de Itens' e exibe o nome", async () => {
    render(<ImportPage />);

    // Modo default é "Cenário Completo" → dois dropzones só-clique que agora
    // aceitam drop.
    const dropzone = screen
      .getByRole("heading", { name: "Planilha de Itens" })
      .closest("div") as HTMLElement;

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [xlsx("orcamento.xlsx")] },
    });

    await waitFor(() =>
      expect(screen.getByText("orcamento.xlsx")).toBeInTheDocument()
    );
  });
});

describe("ImportPage — cancelar durante o processamento (#2)", () => {
  it("aborta o upload e volta para a tela de envio", async () => {
    // Upload que nunca resolve — captura o AbortSignal para checar o abort.
    let captured: AbortSignal | undefined;
    vi.mocked(uploadScenario).mockImplementation(
      ((_p: string, _i: File, _n: File, _name: string, signal?: AbortSignal) => {
        captured = signal;
        return new Promise(() => {});
      }) as never
    );

    const user = userEvent.setup();
    const { container } = render(<ImportPage />);

    // Nome + os dois arquivos (inputs escondidos, na ordem itens → insumos).
    await user.type(
      screen.getByPlaceholderText(/Estaca Helice/i),
      "Cenário X"
    );
    const fileInputs = container.querySelectorAll('input[type="file"]');
    await user.upload(fileInputs[0] as HTMLInputElement, xlsx("itens.xlsx"));
    await user.upload(fileInputs[1] as HTMLInputElement, xlsx("insumos.xlsx"));

    await user.click(screen.getByRole("button", { name: /Processar Cenário/i }));

    // Entrou em "processing" → aviso e botão Cancelar visíveis.
    await waitFor(() =>
      expect(screen.getByText(/Processando arquivo/i)).toBeInTheDocument()
    );
    expect(captured?.aborted).toBe(false);

    await user.click(screen.getByRole("button", { name: /^Cancelar$/i }));

    // Signal abortado e de volta ao envio.
    expect(captured?.aborted).toBe(true);
    await waitFor(() =>
      expect(screen.queryByText(/Processando arquivo/i)).not.toBeInTheDocument()
    );
    expect(
      screen.getByRole("heading", { name: "Planilha de Itens" })
    ).toBeInTheDocument();
  });
});
