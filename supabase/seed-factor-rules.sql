-- ===========================================================================
-- Seed de Factor Rules — itens recorrentes (decisão #1 = correção + rules)
-- ===========================================================================
--
-- Operacionaliza a opção (b) do PLANO_CONTINUACAO §4: fixar os itens
-- recorrentes como Factor Rule (prioridade 0 no autoMatchItem) para que o
-- valor "correto" seja DETERMINÍSTICO e barato, independentemente do reranker
-- (que não é determinístico turno a turno).
--
-- ⚠️ REVISAR ANTES DE APLICAR (igual à Fase 0):
--   1. `company_id`: aqui usa 'company-htb' (seed demo). Troque pelo company_id
--      real do tenant (ver public.users.company_id do cliente).
--   2. `created_by`: 'user-joao' (seed demo). Troque por um user real da empresa.
--   3. VALORES: são os fatores "corretos" citados em docs/PARIDADE_SIMULADOR.md.
--      Confirme cada um com a base/metodologia vigente antes de confiar no total.
--   4. `match_keyword` DEVE estar normalizado pela MESMA regra de
--      lib/server/keyword.ts (minúsculo, sem acento, pontuação→espaço,
--      espaços colapsados). O match é por substring: descNorm.includes(keyword).
--      Mantenha keywords ESPECÍFICAS para não casar itens errados
--      (ex.: "aco ca 50", não "aco"; "concreto 40", não "concreto").
--
-- Idempotente: usa o par único (company_id, match_keyword) — re-rodar atualiza.
-- Requer o índice/constraint; se não houver UNIQUE, rode o DELETE antes.

DELETE FROM public.factor_rules
 WHERE company_id = 'company-htb'
   AND match_keyword IN ('concreto 40', 'aco ca 50', 'oleo diesel');

INSERT INTO public.factor_rules
  (company_id, match_keyword, original_description,
   factor_value, factor_unit, factor_name, source_tier, source_description,
   created_by, is_active)
VALUES
  -- Concreto 40 MPa → CECarbon BR 274/m³ (vence o Ecoinvent genérico 404/m³).
  ('company-htb', 'concreto 40', 'CONCRETO 40 MPA USINADO',
   274, 'kgCO₂/m3', 'Concreto 40 MPa', 'cecarbon',
   'Factor Rule curada (decisão #1 = correção) — revisar valor',
   'user-joao', true),

  -- Aço CA-50 / armadura → reinforcing steel 2,21/kg (escolha do reranker).
  ('company-htb', 'aco ca 50', 'ACO CA-50 - BITOLA MEDIA',
   2.21, 'kgCO₂/kg', 'Aço CA-50 (reinforcing steel)', 'cecarbon',
   'Factor Rule curada (decisão #1 = correção) — revisar valor',
   'user-joao', true),

  -- Óleo diesel → GHG Protocol BR ~2,68/L (combustão).
  ('company-htb', 'oleo diesel', 'OLEO DIESEL',
   2.68, 'kgCO₂/L', 'Óleo Diesel (GHG Protocol BR)', 'ghg_protocol',
   'Factor Rule curada (decisão #1 = correção) — revisar valor',
   'user-joao', true);
