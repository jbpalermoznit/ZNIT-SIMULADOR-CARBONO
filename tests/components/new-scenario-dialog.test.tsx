// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// next/navigation + API layer are mocked so the dialog renders in isolation.
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api/projects", () => ({
  uploadAbc: vi.fn(),
  uploadScenario: vi.fn(),
}));

import { NewScenarioFromUploadDialog } from "@/components/scenarios/new-scenario-from-upload-dialog";
import { uploadAbc } from "@/lib/api/projects";

const xlsx = (name: string) => new File(["x"], name);

function renderDialog() {
  const onCreated = vi.fn();
  const onClose = vi.fn();
  render(
    <NewScenarioFromUploadDialog
      projectId="p1"
      open
      onClose={onClose}
      onCreated={onCreated}
    />
  );
  return { onCreated, onClose };
}

beforeEach(() => {
  push.mockReset();
  vi.mocked(uploadAbc).mockReset();
});

describe("NewScenarioFromUploadDialog — banner de sucesso (#3)", () => {
  it("mostra confirmação verde e chama onCreated ao concluir o upload", async () => {
    vi.mocked(uploadAbc).mockResolvedValue({ base_scenario_id: "new-1" } as never);
    const user = userEvent.setup();
    const { onCreated } = renderDialog();

    // ABC mode (default): 1 dropzone com 1 input de arquivo.
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, xlsx("abc.xlsx"));
    await user.type(
      screen.getByPlaceholderText(/Concreto reciclado/i),
      "Cenário B"
    );

    await user.click(screen.getByRole("button", { name: /Criar e calcular/i }));

    await waitFor(() =>
      expect(screen.getByText(/criado com sucesso/i)).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /Criado!/i })).toBeInTheDocument();
    expect(onCreated).toHaveBeenCalledWith("new-1");
  });

  it("mostra erro (não sucesso) quando o upload falha", async () => {
    vi.mocked(uploadAbc).mockRejectedValue(new Error("Falha no servidor"));
    const user = userEvent.setup();
    renderDialog();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, xlsx("abc.xlsx"));
    await user.type(screen.getByPlaceholderText(/Concreto reciclado/i), "X");
    await user.click(screen.getByRole("button", { name: /Criar e calcular/i }));

    await waitFor(() =>
      expect(screen.getByText(/Falha no servidor/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/criado com sucesso/i)).not.toBeInTheDocument();
  });
});

describe("NewScenarioFromUploadDialog — drag-and-drop (DropZone)", () => {
  it("aceita arquivo solto (onDrop) e exibe o nome", () => {
    renderDialog();

    const dropzone = screen
      .getByText(/Arraste o arquivo ou clique/i)
      .closest("button") as HTMLElement;

    fireEvent.drop(dropzone, { dataTransfer: { files: [xlsx("arrastado.xlsx")] } });

    expect(screen.getByText("arrastado.xlsx")).toBeInTheDocument();
  });
});
