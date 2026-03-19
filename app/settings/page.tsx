"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const STORAGE_KEY = "znit_settings";

function loadSettings() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function SettingsPage() {
  const [portfolioTitle, setPortfolioTitle] = useState("Portfólio HTB");
  const [portfolioSubtitle, setPortfolioSubtitle] = useState(
    "Projetos ativos · Piloto 90 dias · Grupo HTB"
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const s = loadSettings();
    if (s?.portfolioTitle) setPortfolioTitle(s.portfolioTitle);
    if (s?.portfolioSubtitle) setPortfolioSubtitle(s.portfolioSubtitle);
  }, []);

  const handleSave = () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ portfolioTitle, portfolioSubtitle })
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="p-7 max-w-2xl">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-[#030304]">Configurações</h1>
        <p className="text-sm text-[#808181] mt-0.5">Personalize a plataforma para sua empresa</p>
      </div>

      <div className="bg-white rounded-xl border border-[#E0E4E3] divide-y divide-[#F0F4F3]">
        <div className="px-6 py-5">
          <h2 className="text-sm font-bold text-[#030304] mb-4">Dashboard — Portfólio</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#404040] mb-1.5">
                Título do portfólio
              </label>
              <input
                type="text"
                value={portfolioTitle}
                onChange={(e) => { setPortfolioTitle(e.target.value); setSaved(false); }}
                className="w-full h-9 px-3 rounded-lg border border-[#E0E4E3] text-sm text-[#030304] bg-[#F8FAF9] focus:outline-none focus:border-[#56B7A5] focus:bg-white transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#404040] mb-1.5">
                Subtítulo
              </label>
              <input
                type="text"
                value={portfolioSubtitle}
                onChange={(e) => { setPortfolioSubtitle(e.target.value); setSaved(false); }}
                className="w-full h-9 px-3 rounded-lg border border-[#E0E4E3] text-sm text-[#030304] bg-[#F8FAF9] focus:outline-none focus:border-[#56B7A5] focus:bg-white transition-all"
              />
            </div>
          </div>
        </div>

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
