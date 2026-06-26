/**
 * Backfill dos embeddings de fatores (Fase 1 — RAG).
 *
 * Lê CECarbon / GHG / Ecoinvent do schema `backend`, gera embeddings com a
 * Voyage (voyage-3.5) e popula `backend.factor_embeddings` (criada pela
 * migração migration-pgvector-factor-embeddings.sql).
 *
 * Uso:
 *   SUPABASE_EMISSION_URL=... SUPABASE_EMISSION_SERVICE_KEY=... \
 *   VOYAGE_API_KEY=... node scripts/backfill-factor-embeddings.mjs
 *
 * (Aceita também SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY como fallback —
 *  ajuste conforme o seu .env. Standalone de propósito: não importa lib/ para
 *  evitar a cadeia de env do app.)
 */
import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.SUPABASE_EMISSION_URL ?? process.env.SUPABASE_URL;
const SUPA_KEY =
  process.env.SUPABASE_EMISSION_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const VOYAGE_KEY = process.env.VOYAGE_API_KEY;
const MODEL = process.env.FACTOR_EMBEDDINGS_MODEL ?? "voyage-3.5";

if (!SUPA_URL || !SUPA_KEY) throw new Error("Configure SUPABASE_(EMISSION_)URL/KEY");
if (!VOYAGE_KEY) throw new Error("Configure VOYAGE_API_KEY");

const db = createClient(SUPA_URL, SUPA_KEY, { db: { schema: "backend" } });

// PostgREST devolve no máximo 1000 linhas por requisição. Sem paginar, o
// Ecoinvent (6157 linhas) e o GHG (1049) eram truncados em 1000 — só ~16% do
// Ecoinvent virava embedding. Pagina via .range() até esgotar.
async function fetchAll(table) {
  const out = [];
  const page = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await db.from(table).select("*").range(from, from + page - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
    from += page;
  }
  return out;
}

async function embedBatch(texts) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${VOYAGE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: texts, model: MODEL, input_type: "document" }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

/** Normaliza uma fonte para linhas {source_tier, source_id, description, unit, factor_value, factor_unit, product_unit, factor_source}. */
async function loadRows() {
  const rows = [];

  // CECarbon
  {
    const data = await fetchAll("produtos_cecarbon_dev");
    for (const r of data ?? []) {
      const desc = r["Descrição fator de emissao"];
      const f = parseFloat(r["fator de emissão (kgCO2)"]);
      if (!desc || String(desc).startsWith("*") || !(f > 0)) continue;
      const u = (r["Unidade"] ?? "").trim();
      rows.push({
        source_tier: "cecarbon", source_id: String(r.id), description: desc,
        unit: u, factor_value: f, factor_unit: `kgCO₂/${u}`, product_unit: u,
        factor_source: r["Referencia"] ?? "CECARBON 2024",
      });
    }
  }
  // GHG
  {
    const data = await fetchAll("fatores_ghg_dev");
    for (const r of data ?? []) {
      if (!r.produto) continue;
      const co2e = (parseFloat(r.co2) || 0) + (parseFloat(r.ch4) || 0) * 28 + (parseFloat(r.n2o) || 0) * 265;
      if (!(co2e > 0)) continue;
      rows.push({
        source_tier: "ghg_protocol", source_id: String(r.id), description: r.produto,
        unit: "", factor_value: Math.round(co2e * 1e6) / 1e6, factor_unit: "kgCO2e", product_unit: "",
        factor_source: `GHG Protocol BR ${r.versao_ghg ?? ""}`,
      });
    }
  }
  // Ecoinvent
  {
    const data = await fetchAll("ecoinvent_dev");
    for (const r of data ?? []) {
      const f = parseFloat(r.impact_score);
      if (!r.product_name || !(f > 0)) continue;
      const pu = (r.product_unit ?? "").trim();
      const name = [r.product_name, r.product_name_pt].filter(Boolean).join(" / ");
      rows.push({
        source_tier: "ecoinvent", source_id: String(r.product_id), description: name,
        unit: pu, factor_value: f, factor_unit: pu ? `kgCO2e/${pu}` : "kg CO2-Eq", product_unit: pu,
        factor_source: `Ecoinvent — ${r.activity_name ?? ""}`,
      });
    }
  }
  return rows;
}

async function main() {
  const loaded = await loadRows();
  // Dedup por (source_tier, source_id): a fonte tem ids repetidos e o upsert
  // rejeita ("ON CONFLICT cannot affect row a second time") se a mesma chave
  // cair no mesmo lote. Mantém a última ocorrência.
  const byKey = new Map();
  for (const r of loaded) byKey.set(`${r.source_tier}::${r.source_id}`, r);
  const rows = [...byKey.values()];
  const dropped = loaded.length - rows.length;
  console.log(
    `Carregados ${loaded.length} fatores` +
      (dropped > 0 ? ` (${dropped} duplicados removidos → ${rows.length})` : "") +
      `. Gerando embeddings (${MODEL})...`,
  );
  const BATCH = 100;
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const embs = await embedBatch(slice.map((r) => r.description));
    const payload = slice.map((r, j) => ({ ...r, embedding: embs[j] }));
    const { error } = await db
      .from("factor_embeddings")
      .upsert(payload, { onConflict: "source_tier,source_id" });
    if (error) throw error;
    done += slice.length;
    console.log(`  upsert ${done}/${rows.length}`);
  }
  console.log("Backfill concluído.");
}

main().catch((e) => { console.error(e); process.exit(1); });
