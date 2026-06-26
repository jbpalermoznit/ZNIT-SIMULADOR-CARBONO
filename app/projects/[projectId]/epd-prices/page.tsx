"use client";

import { useState, useCallback } from "react";
import { Search, Loader2, Check, Trash2, DollarSign } from "lucide-react";
import {
  searchEpdPrices,
  saveEpd,
  clearEpdPrice,
  type EpdPriceItem,
} from "@/lib/api/epd-prices";

export default function EpdPricesPage() {
  const [query, setQuery] = useState("");
  const [brazilOnly, setBrazilOnly] = useState(true);
  const [results, setResults] = useState<EpdPriceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [gwpDrafts, setGwpDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async () => {
    // Sem termo + "Só Brasil" → lista todos os EPDs do Brasil.
    if (!query.trim() && !brazilOnly) return;
    setLoading(true);
    setError(null);
    try {
      const r = await searchEpdPrices(query.trim(), brazilOnly);
      setResults(r);
      setDrafts({});
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro na busca");
    } finally {
      setLoading(false);
    }
  }, [query, brazilOnly]);

  const save = async (item: EpdPriceItem) => {
    const priceRaw = drafts[item.epd_id];
    const gwpRaw = gwpDrafts[item.epd_id];
    const fields: { price?: number; gwp_a1a3?: number; declaredUnit?: string } = {
      declaredUnit: item.declared_unit,
    };
    if (priceRaw != null && priceRaw !== "") {
      const price = parseFloat(priceRaw.replace(",", "."));
      if (!Number.isFinite(price) || price <= 0) { setError("Preço inválido (> 0)."); return; }
      fields.price = price;
    }
    if (gwpRaw != null && gwpRaw !== "") {
      const gwp = parseFloat(gwpRaw.replace(",", "."));
      if (!Number.isFinite(gwp) || gwp <= 0) { setError("GWP inválido (> 0)."); return; }
      fields.gwp_a1a3 = gwp;
    }
    if (fields.price == null && fields.gwp_a1a3 == null) {
      setError("Informe preço e/ou GWP.");
      return;
    }
    setSavingId(item.epd_id);
    setError(null);
    try {
      await saveEpd(item.epd_id, fields);
      setResults((prev) =>
        prev.map((r) =>
          r.epd_id === item.epd_id
            ? {
                ...r,
                price: fields.price ?? r.price,
                gwp_a1a3: fields.gwp_a1a3 ?? r.gwp_a1a3,
                updated_at: new Date().toISOString(),
              }
            : r
        )
      );
      setDrafts((d) => { const n = { ...d }; delete n[item.epd_id]; return n; });
      setGwpDrafts((d) => { const n = { ...d }; delete n[item.epd_id]; return n; });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSavingId(null);
    }
  };

  const clear = async (item: EpdPriceItem) => {
    setSavingId(item.epd_id);
    try {
      await clearEpdPrice(item.epd_id);
      setResults((prev) =>
        prev.map((r) => (r.epd_id === item.epd_id ? { ...r, price: null, updated_at: null } : r))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao remover");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="p-7">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#030304] mb-1">Cadastro de preços de EPD</h1>
        <p className="text-sm text-[#808181]">
          Preencha o preço dos EPDs que sua empresa usa. Ao substituir um material nas
          Recomendações, o preço cadastrado aqui é usado para calcular o custo de abatimento.
        </p>
      </div>

      {/* Busca */}
      <div className="bg-white rounded-xl border border-[#E0E4E3] p-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#BDBDBC]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Buscar EPD (ex.: concreto, aço, cimento, fornecedor...)"
              className="w-full pl-9 pr-3 h-10 rounded-lg border border-[#E0E4E3] text-sm focus:outline-none focus:border-[#56B7A5] bg-[#F8FAF9]"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-[#404040] cursor-pointer select-none">
            <input type="checkbox" checked={brazilOnly} onChange={(e) => setBrazilOnly(e.target.checked)} />
            Só Brasil
          </label>
          <button
            onClick={runSearch}
            disabled={loading || (!query.trim() && !brazilOnly)}
            className="h-10 px-4 rounded-lg bg-[#56B7A5] text-white text-sm font-semibold hover:bg-[#469385] disabled:opacity-40"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : query.trim() ? "Buscar" : "Listar Brasil"}
          </button>
        </div>
        <p className="text-[11px] text-[#BDBDBC] mt-2">
          Preencha o <strong>GWP (A1-A3)</strong> do PDF do EPD para ele virar alternativa nas
          Recomendações (GWP é do produto, compartilhado). O <strong>preço</strong> é por empresa.
          EPDs sem GWP ficam destacados.
        </p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-600">{error}</div>
      )}

      {/* Resultados */}
      {searched && results.length === 0 && !loading && (
        <div className="bg-white rounded-xl border border-[#E0E4E3] p-10 text-center text-sm text-[#808181]">
          Nenhum EPD encontrado{brazilOnly ? " no Brasil" : ""} para “{query}”.
        </div>
      )}

      {results.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E0E4E3] overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E0E4E3] bg-[#F8FAF9]">
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-[#808181] uppercase">EPD</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-[#808181] uppercase">Fornecedor / País</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-[#808181] uppercase">GWP (A1-A3)</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-[#808181] uppercase">Preço (R$ / unid.)</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {results.map((item) => {
                const draft = drafts[item.epd_id];
                const dirty = draft != null && draft !== String(item.price ?? "");
                return (
                  <tr key={item.epd_id} className="border-b border-[#F0F4F3] hover:bg-[#F8FAF9]">
                    <td className="px-4 py-3 max-w-[340px]">
                      <p className="font-semibold text-[#030304] truncate" title={item.titulo}>{item.titulo}</p>
                    </td>
                    <td className="px-4 py-3 text-[#808181]">
                      {item.manufacturer || "—"}<span className="text-[#BDBDBC]"> · {item.country || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={gwpDrafts[item.epd_id] ?? (item.gwp_a1a3 ?? "")}
                          onChange={(e) => setGwpDrafts((d) => ({ ...d, [item.epd_id]: e.target.value }))}
                          placeholder="—"
                          className={`w-20 h-8 px-2 text-right rounded border focus:outline-none focus:border-[#56B7A5] ${item.gwp_a1a3 == null ? "border-[#FECACA] bg-[#FEF2F2]" : "border-[#E0E4E3]"}`}
                          title="GWP A1-A3 (kgCO₂e por unidade declarada). Do PDF do EPD."
                        />
                        <span className="text-[#BDBDBC] text-[10px]">/{item.declared_unit || "?"}</span>
                      </div>
                      {item.gwp_a1a3 == null && (
                        <p className="text-[9px] text-[#EF4444] mt-0.5">sem GWP</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-[#808181]">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={draft ?? (item.price ?? "")}
                          onChange={(e) => setDrafts((d) => ({ ...d, [item.epd_id]: e.target.value }))}
                          placeholder="—"
                          className="w-24 h-8 px-2 text-right rounded border border-[#E0E4E3] focus:outline-none focus:border-[#56B7A5]"
                        />
                        <span className="text-[#BDBDBC] text-[10px]">/{item.declared_unit || "?"}</span>
                      </div>
                      {item.updated_at && !dirty && (
                        <p className="text-[9px] text-[#16A34A] mt-0.5">cadastrado</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => save(item)}
                          disabled={savingId === item.epd_id}
                          className="h-7 px-2 rounded bg-[#56B7A5] text-white text-[11px] font-semibold hover:bg-[#469385] disabled:opacity-40 inline-flex items-center gap-1"
                        >
                          {savingId === item.epd_id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                          Salvar
                        </button>
                        {item.price != null && (
                          <button
                            onClick={() => clear(item)}
                            disabled={savingId === item.epd_id}
                            title="Remover preço"
                            className="h-7 w-7 rounded border border-[#E0E4E3] text-[#BDBDBC] hover:text-[#EF4444] hover:border-[#FECACA] inline-flex items-center justify-center"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!searched && (
        <div className="bg-white rounded-xl border border-[#E0E4E3] p-10 text-center text-sm text-[#808181]">
          <DollarSign size={24} className="mx-auto mb-2 text-[#BDBDBC]" />
          Clique em <strong>Listar Brasil</strong> para ver todos os EPDs do Brasil,
          ou busque um material específico.
        </div>
      )}
    </div>
  );
}
