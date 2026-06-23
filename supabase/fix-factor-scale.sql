-- =====================================================================
-- Fase 0 — Correção de escala de fatores (schema `backend`)
-- =====================================================================
-- Auditoria sobre `produtos_cecarbon_dev` encontrou fatores ~100–1000×
-- acima do esperado (provável tCO2 rotulado como kgCO2, ou erro de
-- digitação / unidade trocada). Nenhum matcher resolve isso — ele escolhe
-- o fator certo, mas o VALOR fica errado. Referências sãs:
--   aço ~1,9 kgCO2/kg (1900/t) · diesel 2,64/L · concreto ~250/m³
--
-- ⚠️ REVISAR antes de aplicar: os valores corrigidos abaixo são a hipótese
-- mais provável (divisão por 100/1000 ou troca kg→t). Confirme contra a
-- fonte (BEN/DEFRA/EPD) antes de rodar em produção. Cada UPDATE é
-- condicionado ao valor atual para ser idempotente e seguro.
--
-- Os fatores com prefixo "*" (ex.: "*aço" 146/kg) já são ignorados pelo
-- matcher (entradas desabilitadas) — não precisam de correção.
-- =====================================================================

BEGIN;

-- óleos lubrificantes: 2758 /L → 2,758 /L  (provável ÷1000; diesel é 2,64/L)
UPDATE backend.produtos_cecarbon_dev
   SET "fator de emissão (kgCO2)" = 2.758
 WHERE id = 6
   AND "Descrição fator de emissao" = 'óleos lubrificantes'
   AND "fator de emissão (kgCO2)" = 2758;

-- materias de aluminio: 912 /kg → 9,12 /kg  (provável ÷100; alumínio ~9–13/kg)
UPDATE backend.produtos_cecarbon_dev
   SET "fator de emissão (kgCO2)" = 9.12
 WHERE id = 7
   AND "Descrição fator de emissao" = 'materias de aluminio'
   AND "fator de emissão (kgCO2)" = 912;

-- aco gerdau (EPD S-P-02257): 941 /kg → o valor é por TONELADA
-- (aço Gerdau EPD A1–A3 ~0,9–1,0 kgCO2/kg). Corrige a UNIDADE kg → t,
-- mantendo o valor (941/t = 0,941/kg).
UPDATE backend.produtos_cecarbon_dev
   SET "Unidade" = 't'
 WHERE id = 119
   AND "Descrição fator de emissao" = 'aco gerdau'
   AND "Unidade" = 'kg'
   AND "fator de emissão (kgCO2)" = 941;

COMMIT;

-- Conferência pós-correção (deve retornar 0 linhas com valor absurdo):
-- SELECT id, "Descrição fator de emissao", "Unidade", "fator de emissão (kgCO2)"
--   FROM backend.produtos_cecarbon_dev
--  WHERE ("Unidade" IN ('kg','L') AND "fator de emissão (kgCO2)" > 10)
--    AND "Descrição fator de emissao" NOT LIKE '*%';
