"use client";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Check, Upload, X } from "lucide-react";

const STORAGE_KEY = "znit_settings";

export interface BrandingSettings {
  portfolioTitle: string;
  portfolioSubtitle: string;
  companyName: string;
  companyLogo: string | null; // base64 data URL
  primaryColor: string;
  reportFooter: string;
}

export function loadSettings(): BrandingSettings {
  if (typeof window === "undefined") return defaultSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch {}
  return defaultSettings();
}

function defaultSettings(): BrandingSettings {
  return {
    portfolioTitle: "Portfólio ZNIT",
    portfolioSubtitle: "Projetos ativos · Piloto 90 dias · ZNIT",
    companyName: "ZNIT Engenharia",
    companyLogo: null,
    primaryColor: "#56B7A5",
    reportFooter: "Relatório gerado pelo ZNIT Carbon Calculator · www.znit.ai",
  };
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<BrandingSettings>(defaultSettings());
  const [saved, setSaved] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const update = (key: keyof BrandingSettings, value: string | null) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) {
      alert("Logo deve ter no máximo 500KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      update("companyLogo", reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="p-7 max-w-2xl">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-[#030304]">Configurações</h1>
        <p className="text-sm text-[#808181] mt-0.5">Personalize a plataforma e identidade visual dos relatórios</p>
      </div>

      <div className="bg-white rounded-xl border border-[#E0E4E3] divide-y divide-[#F0F4F3]">
        {/* Branding / Identity */}
        <div className="px-6 py-5">
          <h2 className="text-sm font-bold text-[#030304] mb-4">Identidade Visual — Relatórios</h2>
          <div className="space-y-4">
            {/* Logo upload */}
            <div>
              <label className="block text-xs font-semibold text-[#404040] mb-1.5">
                Logo da Empresa
              </label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-lg border-2 border-dashed border-[#E0E4E3] flex items-center justify-center bg-[#F8FAF9] overflow-hidden shrink-0">
                  {settings.companyLogo ? (
                    <img src={settings.companyLogo} alt="Logo" className="w-full h-full object-contain p-1" />
                  ) : (
                    <span className="text-xs text-[#BDBDBC] text-center">Sem logo</span>
                  )}
                </div>
                <div className="space-y-2">
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  <Button size="sm" variant="outline" onClick={() => logoInputRef.current?.click()}>
                    <Upload size={13} />
                    {settings.companyLogo ? "Trocar logo" : "Upload logo"}
                  </Button>
                  {settings.companyLogo && (
                    <button
                      onClick={() => update("companyLogo", null)}
                      className="flex items-center gap-1 text-xs text-[#808181] hover:text-[#EF4444]"
                    >
                      <X size={12} /> Remover
                    </button>
                  )}
                  <p className="text-[10px] text-[#BDBDBC]">PNG, JPG ou SVG · Máx. 500KB</p>
                </div>
              </div>
            </div>

            {/* Company name */}
            <div>
              <label className="block text-xs font-semibold text-[#404040] mb-1.5">
                Nome da Empresa
              </label>
              <input
                type="text"
                value={settings.companyName}
                onChange={(e) => update("companyName", e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[#E0E4E3] text-sm text-[#030304] bg-[#F8FAF9] focus:outline-none focus:border-[#56B7A5] focus:bg-white transition-all"
              />
            </div>

            {/* Primary color */}
            <div>
              <label className="block text-xs font-semibold text-[#404040] mb-1.5">
                Cor Primária
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={settings.primaryColor}
                  onChange={(e) => update("primaryColor", e.target.value)}
                  className="w-9 h-9 rounded-lg border border-[#E0E4E3] cursor-pointer"
                />
                <input
                  type="text"
                  value={settings.primaryColor}
                  onChange={(e) => update("primaryColor", e.target.value)}
                  className="w-28 h-9 px-3 rounded-lg border border-[#E0E4E3] text-sm font-mono text-[#030304] bg-[#F8FAF9] focus:outline-none focus:border-[#56B7A5] focus:bg-white transition-all"
                />
                <div className="flex gap-1">
                  {["#56B7A5", "#1e40af", "#030304", "#b45309", "#7c3aed"].map((c) => (
                    <button
                      key={c}
                      onClick={() => update("primaryColor", c)}
                      className="w-6 h-6 rounded-full border-2 transition-all"
                      style={{
                        backgroundColor: c,
                        borderColor: settings.primaryColor === c ? "#030304" : "transparent",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Report footer */}
            <div>
              <label className="block text-xs font-semibold text-[#404040] mb-1.5">
                Rodapé do Relatório
              </label>
              <input
                type="text"
                value={settings.reportFooter}
                onChange={(e) => update("reportFooter", e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[#E0E4E3] text-sm text-[#030304] bg-[#F8FAF9] focus:outline-none focus:border-[#56B7A5] focus:bg-white transition-all"
              />
            </div>
          </div>
        </div>

        {/* Dashboard */}
        <div className="px-6 py-5">
          <h2 className="text-sm font-bold text-[#030304] mb-4">Dashboard — Portfólio</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#404040] mb-1.5">
                Título do portfólio
              </label>
              <input
                type="text"
                value={settings.portfolioTitle}
                onChange={(e) => update("portfolioTitle", e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[#E0E4E3] text-sm text-[#030304] bg-[#F8FAF9] focus:outline-none focus:border-[#56B7A5] focus:bg-white transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#404040] mb-1.5">
                Subtítulo
              </label>
              <input
                type="text"
                value={settings.portfolioSubtitle}
                onChange={(e) => update("portfolioSubtitle", e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[#E0E4E3] text-sm text-[#030304] bg-[#F8FAF9] focus:outline-none focus:border-[#56B7A5] focus:bg-white transition-all"
              />
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="px-6 py-5">
          <h2 className="text-sm font-bold text-[#030304] mb-3">Pré-visualização do Cabeçalho</h2>
          <div className="border border-[#E0E4E3] rounded-lg p-4 bg-[#FAFAFA]">
            <div className="flex items-center justify-between border-b pb-3 mb-2" style={{ borderColor: settings.primaryColor + "40" }}>
              <div>
                <p className="text-sm font-bold" style={{ color: settings.primaryColor }}>
                  RELATÓRIO DE EMISSÕES DE CARBONO
                </p>
                <p className="text-[10px] text-[#808181] mt-0.5">
                  Projeto Demo · Emitido em {new Date().toLocaleDateString("pt-BR")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {settings.companyLogo ? (
                  <img src={settings.companyLogo} alt="Logo" className="h-8 object-contain" />
                ) : (
                  <span className="text-sm font-bold" style={{ color: settings.primaryColor }}>
                    {settings.companyName}
                  </span>
                )}
              </div>
            </div>
            <p className="text-[9px] text-[#BDBDBC]">{settings.reportFooter}</p>
          </div>
        </div>

        {/* Save */}
        <div className="px-6 py-4 flex items-center justify-between">
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-[#1d7a6b] font-medium">
              <Check size={14} /> Configurações salvas
            </span>
          )}
          {!saved && <span />}
          <Button onClick={handleSave}>
            Salvar alterações
          </Button>
        </div>
      </div>
    </div>
  );
}
