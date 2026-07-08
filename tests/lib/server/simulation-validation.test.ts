import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ===========================================================================
// Validação end-to-end com as planilhas REAIS de simulation/ (não versionadas
// — o suite inteiro é pulado quando a pasta não existe, ex.: CI).
//
// Roda o pipeline real fora do HTTP: parseAbcFile + parseInsumoFile →
// expansão de receitas (mesma lógica do upload-scenario) → autoMatchItem com
// as 51 Factor Rules do seed → emissão = qty × fator × resolveConversion →
// totais do cenário → agregação do export-items.
//
// Compara com simulation/relatorio_pulperpit_v29.xlsx (último export da
// versão anterior, apresentado ao cliente) e trava que o EXPORT devolve
// exatamente o que foi calculado.
// ===========================================================================

const ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const SIM_DIR = join(ROOT, "simulation");
const hasFiles = existsSync(SIM_DIR);

function findFile(prefix: string): string {
  const files = readdirSync(SIM_DIR);
  const hit = files.find((f) => f.startsWith(prefix) && f.endsWith(".xlsx"));
  if (!hit) throw new Error(`arquivo com prefixo '${prefix}' não encontrado em simulation/`);
  return join(SIM_DIR, hit);
}

// --- mock supabase: factor_rules do seed --------------------------------
const h = vi.hoisted(() => ({ rules: [] as Record<string, unknown>[] }));

vi.mock("@/lib/server/supabase", () => {
  const make = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "update", "insert", "eq", "order", "delete", "in", "neq", "limit"]) {
      chain[m] = () => chain;
    }
    chain.single = () => Promise.resolve({ data: null });
    chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve({ data: h.rules }).then(res, rej);
    return chain;
  };
  return { supabase: { from: () => make() }, supabaseEmission: { from: () => make() } };
});

vi.mock("@/lib/server/supabase-emission", () => ({
  searchEcoinvent: vi.fn().mockResolvedValue([]),
  searchGhg: vi.fn().mockResolvedValue([]),
  searchCecarbon: vi.fn().mockResolvedValue([]),
}));

import { parseAbcFile } from "@/lib/server/parser";
import { parseInsumoFile } from "@/lib/server/parser-insumos";
import { autoMatchItem } from "@/lib/server/emission-mapper";
import { resolveConversion } from "@/lib/server/calculator";
import { normalizeKeyword } from "@/lib/server/keyword";
import { expandScenarioItems } from "@/lib/server/scenario-expansion";
import { parseSeedRows } from "../../helpers/seed-parser";

interface SimItem {
  cost_code: string;
  description: string;
  quantity: number;
  unit: string;
  item_type: string;
  status: "pending" | "excluded" | "blocked";
  parent: string | null;
}

// A MESMA expansão que roda em produção (lib/server/scenario-expansion.ts).
function expandScenario(itemsPath: string, insumosPath: string): SimItem[] {
  const parsed = parseAbcFile(readFileSync(itemsPath), itemsPath);
  const recipes = parseInsumoFile(readFileSync(insumosPath), insumosPath);
  const { parents, children } = expandScenarioItems(parsed.items, recipes);
  const parentByKey = new Map(parents.map((p) => [p.key, p]));
  return [...parents, ...children].map((it) => ({
    cost_code: it.cost_code,
    description: it.description,
    quantity: it.quantity,
    unit: it.unit,
    item_type: it.item_type,
    status: it.mapping_status,
    parent: it.parent_key ? parentByKey.get(it.parent_key)?.description ?? null : null,
  }));
}

// --- cálculo (calcItemEmission real: qty × fator × resolveConversion) ----
interface ComputedRow extends SimItem {
  factor_value: number | null;
  factor_unit: string | null;
  factor_name: string | null;
  emission_kg: number;
  matched: boolean;
}

async function computeScenario(items: SimItem[]): Promise<ComputedRow[]> {
  const rows: ComputedRow[] = [];
  for (const it of items) {
    if (it.status !== "pending") {
      rows.push({ ...it, factor_value: null, factor_unit: null, factor_name: null, emission_kg: 0, matched: false });
      continue;
    }
    const match = await autoMatchItem(it.description, it.unit, "efb2ccda-4024-44fa-aee7-5889b316be26");
    const best = match.best;
    if (best && (best.factor_value ?? 0) > 0) {
      const conv = resolveConversion(it.description, it.unit, best.factor_unit);
      rows.push({
        ...it,
        factor_value: best.factor_value, factor_unit: best.factor_unit,
        factor_name: best.factor_name, matched: true,
        emission_kg: it.quantity * best.factor_value * conv,
      });
    } else {
      rows.push({ ...it, factor_value: null, factor_unit: null, factor_name: null, emission_kg: 0, matched: false });
    }
  }
  return rows;
}

// --- agregações: calculadora (scenario_results) e export-items -----------
function scenarioTotalT(rows: ComputedRow[]): number {
  // calculateScenarioResult: soma emission_kgco2e>0 de não-excluídos, /1000, 4dp
  const kg = rows.filter((r) => r.status !== "excluded" && r.emission_kg > 0)
    .reduce((s, r) => s + r.emission_kg, 0);
  return Math.round((kg / 1000) * 10000) / 10000;
}

function exportTotalT(rows: ComputedRow[]): number {
  // export-items: por linha, is_excluded→0, senão round(kg/1000, 4dp); soma
  return rows.reduce((s, r) => {
    if (r.status === "excluded" || r.status === "blocked") return s;
    const t = r.emission_kg ? Math.round((r.emission_kg / 1000) * 10000) / 10000 : 0;
    return s + t;
  }, 0);
}

// --- relatório v29 (ground truth apresentado ao cliente) -----------------
interface V29Comp { desc: string; unit: string; qty: number; em_t: number; fator: number }

function readV29(): Record<string, { total: number; comps: V29Comp[] }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  const wb = XLSX.read(readFileSync(join(SIM_DIR, "relatorio_pulperpit_v29.xlsx")), { type: "buffer" });
  const out: Record<string, { total: number; comps: V29Comp[] }> = {};
  for (const name of wb.SheetNames) {
    const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null });
    const totalLine = String(rows[1]?.[0] ?? "");
    const m = totalLine.match(/Emissões Totais:\s*([\d.,]+)/);
    const total = m ? parseFloat(m[1].replace(/\./g, "").replace(",", ".")) : NaN;
    const comps: V29Comp[] = [];
    for (const r of rows.slice(3)) {
      if (String(r[1]) !== "comp") continue;
      comps.push({
        desc: String(r[2]).replace(/^\s*↳\s*/, "").trim(),
        unit: String(r[5] ?? ""),
        qty: Number(r[6] ?? 0),
        em_t: Number(r[7] ?? 0),
        fator: Number(r[3] ?? 0),
      });
    }
    out[name] = { total, comps };
  }
  return out;
}

// --- suite ----------------------------------------------------------------
describe.skipIf(!hasFiles)("validação end-to-end — planilhas reais de simulation/", () => {
  h.rules = parseSeedRows(
    readFileSync(join(ROOT, "supabase", "seed-factor-rules-v29-htb.sql"), "utf8"),
  ).map((r, i) => ({ ...r, id: `seed-${i}`, times_applied: 0 }));

  const SCENARIOS = [
    { name: "Padrão", itens: "Solucao.estaca.helice", insumos: "SECAGEM-Sump.Pit_In.Loco" },
    { name: "Novo", itens: "Solucao.estaca.prancha.pulper.pit", insumos: "SECAGEM-Sump.Pit_Estaca.Prancha" },
  ];

  it("pipeline real reproduz os totais do v29 e export == cálculo", async () => {
    const v29 = readV29();
    const report: Record<string, unknown> = {};

    for (const sc of SCENARIOS) {
      const items = expandScenario(findFile(sc.itens), findFile(sc.insumos));
      const rows = await computeScenario(items);
      const calcT = scenarioTotalT(rows);
      const expT = exportTotalT(rows);
      const target = v29[sc.name].total;

      // --- diff por insumo (agregado por keyword) vs v29 ---
      const mine = new Map<string, { qty: number; em_t: number; unit: string; factor: number | null; name: string }>();
      for (const r of rows) {
        if (r.status === "blocked") continue;
        const k = normalizeKeyword(r.description);
        const cur = mine.get(k) ?? { qty: 0, em_t: 0, unit: r.unit, factor: r.factor_value, name: r.description };
        cur.qty += r.quantity;
        cur.em_t += r.emission_kg / 1000;
        mine.set(k, cur);
      }
      const theirs = new Map<string, { qty: number; em_t: number; unit: string; fator: number }>();
      for (const c of v29[sc.name].comps) {
        const k = normalizeKeyword(c.desc);
        const cur = theirs.get(k) ?? { qty: 0, em_t: 0, unit: c.unit, fator: c.fator };
        cur.qty += c.qty;
        cur.em_t += c.em_t;
        theirs.set(k, cur);
      }

      const allKeys = new Set([...mine.keys(), ...theirs.keys()]);
      const diffs: Record<string, unknown>[] = [];
      for (const k of allKeys) {
        const a = mine.get(k);
        const b = theirs.get(k);
        const emA = a?.em_t ?? 0;
        const emB = b?.em_t ?? 0;
        if (Math.abs(emA - emB) > 0.005 || !a || !b) {
          // atribuição por item-pai (de onde vem cada quantidade nossa)
          const porPai = rows
            .filter((r) => r.status !== "blocked" && normalizeKeyword(r.description) === k)
            .map((r) => ({
              pai: r.parent ?? "(item direto)",
              qty: Math.round(r.quantity * 1000) / 1000,
              em_t: Math.round((r.emission_kg / 1000) * 10000) / 10000,
            }));
          diffs.push({
            insumo: a?.name ?? k,
            unit: a?.unit ?? b?.unit,
            qty_atual: a ? Math.round(a.qty * 1000) / 1000 : null,
            qty_v29: b ? Math.round(b.qty * 1000) / 1000 : null,
            em_t_atual: Math.round(emA * 10000) / 10000,
            em_t_v29: Math.round(emB * 10000) / 10000,
            delta_t: Math.round((emA - emB) * 10000) / 10000,
            so_num_lado: !a ? "só no v29" : !b ? "só na versão atual" : null,
            por_pai: porPai,
          });
        }
      }
      diffs.sort((x, y) => Math.abs(y.delta_t as number) - Math.abs(x.delta_t as number));

      const unmatched = rows.filter((r) => r.status === "pending" && !r.matched)
        .map((r) => ({ desc: r.description, unit: r.unit, qty: r.quantity }));
      const excluded = rows.filter((r) => r.status === "excluded")
        .map((r) => ({ desc: r.description, tipo: r.item_type, qty: r.quantity, unit: r.unit }));

      report[sc.name] = {
        total_calculado_t: calcT,
        total_export_t: Math.round(expT * 10000) / 10000,
        total_v29_t: target,
        delta_vs_v29_t: Math.round((calcT - target) * 10000) / 10000,
        delta_pct: Math.round(((calcT - target) / target) * 10000) / 100,
        itens_calculo: rows.filter((r) => r.status !== "blocked").length,
        itens_com_fator: rows.filter((r) => r.matched).length,
        sem_fator: unmatched,
        excluidos_count: excluded.length,
        excluidos: excluded.slice(0, 30),
        diffs_por_insumo: diffs,
      };

      // EXPORT == CÁLCULO (mesma fonte persistida; tolerância = arredondamento 4dp/linha)
      expect(Math.abs(expT - calcT)).toBeLessThan(0.01);

      // Superset do v29: NENHUM insumo que o v29 reportou pode emitir MENOS
      // na versão atual (perder emissão = regressão). Emissões a mais são
      // esperadas — o v29 omitiu linhas do orçamento (ver validation-report).
      for (const [k, b] of theirs) {
        const emA = mine.get(k)?.em_t ?? 0;
        expect(
          emA,
          `${sc.name} / ${k}: atual ${emA.toFixed(3)} t < v29 ${b.em_t.toFixed(3)} t`,
        ).toBeGreaterThanOrEqual(b.em_t - 0.01);
      }

      // Total é um superset do v29 (nunca abaixo)
      expect(calcT).toBeGreaterThanOrEqual(target - 0.01);
    }

    writeFileSync(
      join(ROOT, "simulation", "validation-report.json"),
      JSON.stringify(report, null, 2),
    );
    // Diagnóstico legível no output do vitest
    for (const [name, r] of Object.entries(report)) {
      const rr = r as Record<string, unknown>;
      console.log(
        `\n[${name}] calculado=${rr.total_calculado_t} t | export=${rr.total_export_t} t | v29=${rr.total_v29_t} t | Δ=${rr.delta_vs_v29_t} t (${rr.delta_pct}%)`,
      );
    }

  }, 60000);
});
