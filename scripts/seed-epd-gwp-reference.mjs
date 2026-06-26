/**
 * Seed de EPDs de REFERÊNCIA de baixo carbono (com GWP A1-A3) — schema backend.
 *
 * Por quê: o catálogo tem ~17,5k EPDs mas só ~76 com gwp_a1a3, quase todos
 * estrangeiros/nicho — então a página "Recomendações de redução" não acha
 * alternativas para concreto/aço/cimento BR. Este seed insere um conjunto
 * pequeno e CLARAMENTE ROTULADO ("Referência ZNIT (revisar)") de alternativas
 * de baixo carbono, com GWP de faixas publicadas, para o motor produzir
 * recomendações. NÃO são EPDs de fornecedor específico — substitua por EPDs
 * reais quando tiver.
 *
 * ⚠️ REVISAR os GWP antes de confiar no número (faixas de mercado/literatura):
 *  - Concreto baixo carbono (CEM III/escória, ~50% SCM): ~180–260 kgCO2e/m³
 *    (vs ~270–400 do baseline genérico).
 *  - Aço CA-50 reciclado (forno elétrico/EAF): ~0,5–0,8 kgCO2e/kg
 *    (vs ~1,85–2,2 do baseline).
 *  - Cimento CEM III/B (escória): ~0,4–0,5 kgCO2e/kg (vs ~0,9 do CP comum).
 *
 * Idempotente: apaga os rótulos "Referência ZNIT (revisar)" e re-insere.
 * Uso: node --env-file=.env.local scripts/seed-epd-gwp-reference.mjs
 * Remover: DELETE FROM backend.epd_dev WHERE company_name = 'Referência ZNIT (revisar)';
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error("faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
const be = createClient(URL, KEY, { db: { schema: "backend" } });

const COMPANY = "Referência ZNIT (revisar)";

// titulo em inglês (casa as traduções PT→EN do matcher) + info em PT (reforço).
const ROWS = [
  {
    registration_number: "REF-CONC-C25",
    titulo: "Low-carbon ready-mix concrete C25 (CEM III, slag)",
    informacao_produto: "concreto usinado baixo carbono fck 25 cimento CP III escoria",
    declared_unit: "m³", declared_value: 1, gwp_a1a3: 180,
  },
  {
    registration_number: "REF-CONC-C30",
    titulo: "Low-carbon ready-mix concrete C30 (CEM III, slag)",
    informacao_produto: "concreto usinado baixo carbono fck 30 cimento CP III escoria",
    declared_unit: "m³", declared_value: 1, gwp_a1a3: 205,
  },
  {
    registration_number: "REF-CONC-C40",
    titulo: "Low-carbon ready-mix concrete C40 (CEM III, slag)",
    informacao_produto: "concreto usinado baixo carbono fck 40 cimento CP III escoria",
    declared_unit: "m³", declared_value: 1, gwp_a1a3: 250,
  },
  {
    registration_number: "REF-STEEL-CA50",
    titulo: "Recycled reinforcing steel rebar (EAF) CA-50",
    informacao_produto: "aco ca-50 ca50 vergalhao armadura reciclado forno eletrico",
    declared_unit: "kg", declared_value: 1, gwp_a1a3: 0.7,
  },
  {
    registration_number: "REF-CEM-CEMIII",
    titulo: "Blended cement CEM III/B (slag)",
    informacao_produto: "cimento cp iii portland composto escoria baixo carbono",
    declared_unit: "kg", declared_value: 1, gwp_a1a3: 0.45,
  },
];

async function main() {
  // idempotência
  const del = await be.from("epd_dev").delete().eq("company_name", COMPANY);
  if (del.error) console.warn("delete:", del.error.message);

  const payload = ROWS.map((r) => ({
    ...r,
    company_name: COMPANY,
    country: "Brasil",
    geographical_scopes: "Brasil",
    source_url: "https://znit.ai/ref (valor de referência — revisar)",
  }));

  const { data, error } = await be.from("epd_dev").insert(payload).select("id, titulo, gwp_a1a3");
  if (error) {
    console.error("ERRO insert:", error.message);
    process.exit(1);
  }
  console.log(`Inseridos ${data.length} EPDs de referência:`);
  for (const r of data) console.log(`  #${r.id} ${r.gwp_a1a3} | ${r.titulo}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
