-- ===========================================================================
-- migration-v15-equipment-productivity-index.sql
-- ---------------------------------------------------------------------------
-- Índice de produtividade (horas por unidade de quantidade do item) em
-- equipment_rules.
--
-- O cálculo de equipamento (Tipo E, "Parametrizar item") sempre assumiu que
-- a quantidade do item já está em horas: total = item.quantity × consumo/h ×
-- fator de emissão. Isso quebra pra equipamentos cuja produtividade é
-- medida por outra unidade (ex.: guindaste a 2,35 h por m³ de concreto
-- lançado) — a quantidade do item vem em m³, não em horas.
--
-- productivity_index converte: horas = item.quantity × productivity_index.
-- Default 1 preserva o comportamento atual pra todo equipamento existente
-- (quantidade já em horas).
-- ===========================================================================

ALTER TABLE public.equipment_rules
  ADD COLUMN IF NOT EXISTS productivity_index DOUBLE PRECISION NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.equipment_rules.productivity_index IS
  'Horas de operação por unidade de quantidade do item (ex.: 2,35 h/m³ para guindaste). 1 = quantidade do item já está em horas (comportamento padrão).';
