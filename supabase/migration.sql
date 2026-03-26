-- ==========================================================================
-- ZNIT ESG — Migration: Create app tables in Supabase (public schema)
-- Emission factor tables remain in schema "backend"
-- ==========================================================================

-- 1. companies
CREATE TABLE IF NOT EXISTS public.companies (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  logo_url TEXT,
  color_primary TEXT DEFAULT '#56B7A5',
  color_secondary TEXT DEFAULT '#E6F3EE',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. users
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id TEXT NOT NULL REFERENCES public.companies(id),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  hashed_password TEXT NOT NULL,
  role TEXT DEFAULT 'analyst',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- 3. projects
CREATE TABLE IF NOT EXISTS public.projects (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id TEXT NOT NULL REFERENCES public.companies(id),
  name TEXT NOT NULL,
  client_name TEXT,
  address TEXT,
  total_area_m2 DOUBLE PRECISION,
  building_type TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. abc_curves
CREATE TABLE IF NOT EXISTS public.abc_curves (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL REFERENCES public.projects(id),
  file_name TEXT NOT NULL,
  imported_at TIMESTAMPTZ DEFAULT now(),
  imported_by_user_id TEXT,
  total_items INTEGER DEFAULT 0,
  total_cost DOUBLE PRECISION DEFAULT 0
);

-- 5. abc_items
CREATE TABLE IF NOT EXISTS public.abc_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  abc_curve_id TEXT NOT NULL REFERENCES public.abc_curves(id) ON DELETE CASCADE,
  cost_code TEXT NOT NULL,
  description TEXT NOT NULL,
  adf DOUBLE PRECISION,
  quantity DOUBLE PRECISION NOT NULL,
  unit TEXT NOT NULL,
  unit_cost DOUBLE PRECISION NOT NULL,
  total_cost DOUBLE PRECISION NOT NULL,
  supplier TEXT,
  cost_pct DOUBLE PRECISION DEFAULT 0,
  cumulative_pct DOUBLE PRECISION DEFAULT 0,
  abc_class TEXT DEFAULT 'C',
  item_type TEXT DEFAULT 'A',
  item_order INTEGER DEFAULT 0,
  mapping_status TEXT DEFAULT 'pending',
  parent_item_id TEXT REFERENCES public.abc_items(id),
  classification_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_abc_items_curve ON public.abc_items(abc_curve_id);
CREATE INDEX IF NOT EXISTS idx_abc_items_cost_code ON public.abc_items(cost_code);

-- 6. item_mappings
CREATE TABLE IF NOT EXISTS public.item_mappings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  abc_item_id TEXT NOT NULL REFERENCES public.abc_items(id),
  source_tier TEXT NOT NULL,
  ecoinvent_product_id TEXT,
  ecoinvent_activity_id TEXT,
  ghg_factor_id INTEGER,
  epd_id INTEGER,
  factor_value DOUBLE PRECISION NOT NULL,
  factor_unit TEXT NOT NULL,
  product_unit TEXT,
  factor_name TEXT NOT NULL,
  factor_source TEXT,
  confidence TEXT,
  similarity_score DOUBLE PRECISION,
  mapped_by TEXT DEFAULT 'auto',
  custom_factor_source TEXT,
  exclusion_justification TEXT,
  distance_km DOUBLE PRECISION,
  transport_modal TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_item_mappings_item ON public.item_mappings(abc_item_id);

-- 7. scenarios
CREATE TABLE IF NOT EXISTS public.scenarios (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL REFERENCES public.projects(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft',
  version INTEGER DEFAULT 1,
  is_base BOOLEAN DEFAULT false,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scenarios_project ON public.scenarios(project_id);

-- 8. scenario_items
CREATE TABLE IF NOT EXISTS public.scenario_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  scenario_id TEXT NOT NULL REFERENCES public.scenarios(id) ON DELETE CASCADE,
  abc_item_id TEXT NOT NULL REFERENCES public.abc_items(id),
  factor_value DOUBLE PRECISION,
  factor_unit TEXT,
  factor_name TEXT,
  source_tier TEXT,
  quantity_override DOUBLE PRECISION,
  emission_kgco2e DOUBLE PRECISION,
  emission_scope3_logistics_kgco2e DOUBLE PRECISION,
  is_excluded BOOLEAN DEFAULT false,
  exclusion_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_scenario_items_scenario ON public.scenario_items(scenario_id);

-- 9. scenario_results
CREATE TABLE IF NOT EXISTS public.scenario_results (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  scenario_id TEXT UNIQUE NOT NULL REFERENCES public.scenarios(id) ON DELETE CASCADE,
  total_kgco2e DOUBLE PRECISION DEFAULT 0,
  total_tco2e DOUBLE PRECISION DEFAULT 0,
  intensity_per_m2 DOUBLE PRECISION,
  scope1_kgco2e DOUBLE PRECISION DEFAULT 0,
  scope2_kgco2e DOUBLE PRECISION DEFAULT 0,
  scope3_materials_kgco2e DOUBLE PRECISION DEFAULT 0,
  scope3_logistics_kgco2e DOUBLE PRECISION DEFAULT 0,
  items_total INTEGER DEFAULT 0,
  items_mapped INTEGER DEFAULT 0,
  items_excluded INTEGER DEFAULT 0,
  coverage_pct DOUBLE PRECISION DEFAULT 0,
  calculated_at TIMESTAMPTZ DEFAULT now()
);

-- 10. factor_rules
CREATE TABLE IF NOT EXISTS public.factor_rules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id TEXT NOT NULL REFERENCES public.companies(id),
  match_keyword TEXT NOT NULL,
  original_description TEXT NOT NULL,
  factor_value DOUBLE PRECISION NOT NULL,
  factor_unit TEXT NOT NULL,
  factor_name TEXT NOT NULL,
  source_tier TEXT NOT NULL,
  source_description TEXT,
  ecoinvent_product_id TEXT,
  ghg_factor_id INTEGER,
  cecarbon_id INTEGER,
  times_applied INTEGER DEFAULT 0,
  times_overridden INTEGER DEFAULT 0,
  created_by TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_factor_rules_company ON public.factor_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_factor_rules_keyword ON public.factor_rules(match_keyword);

-- 11. equipment_rules
CREATE TABLE IF NOT EXISTS public.equipment_rules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id TEXT NOT NULL REFERENCES public.companies(id),
  match_keyword TEXT NOT NULL,
  original_description TEXT NOT NULL,
  category TEXT NOT NULL,
  fuel_type TEXT NOT NULL,
  consumption_per_hour DOUBLE PRECISION NOT NULL,
  consumption_unit TEXT NOT NULL,
  emission_factor_value DOUBLE PRECISION NOT NULL,
  emission_factor_unit TEXT NOT NULL,
  emission_factor_source TEXT NOT NULL,
  emission_factor_tier TEXT NOT NULL,
  scope INTEGER DEFAULT 1,
  notes TEXT,
  times_applied INTEGER DEFAULT 0,
  created_by TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_equipment_rules_company ON public.equipment_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_equipment_rules_keyword ON public.equipment_rules(match_keyword);

-- ==========================================================================
-- RLS — Enable Row Level Security (policies added later)
-- ==========================================================================
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abc_curves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abc_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenario_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenario_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factor_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_rules ENABLE ROW LEVEL SECURITY;

-- Allow service_role to bypass RLS (used by Next.js API routes)
CREATE POLICY "service_role_all" ON public.companies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.abc_curves FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.abc_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.item_mappings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.scenarios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.scenario_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.scenario_results FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.factor_rules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.equipment_rules FOR ALL USING (true) WITH CHECK (true);
