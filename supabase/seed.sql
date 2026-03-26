-- ==========================================================================
-- ZNIT ESG — Seed data for Supabase
-- Run after migration.sql
-- ==========================================================================

-- Company
INSERT INTO public.companies (id, name, color_primary, color_secondary)
VALUES ('company-htb', 'ZNIT Engenharia', '#56B7A5', '#E6F3EE')
ON CONFLICT (id) DO NOTHING;

-- User (password: demo1234 — bcrypt hash)
INSERT INTO public.users (id, company_id, name, email, hashed_password, role)
VALUES (
  'user-joao', 'company-htb', 'João Palermo', 'joao@znit.io',
  '$2b$10$LqR3x9VKo9N5FZvVK9Bnce8j0B5g8R6Y4WZ5B8qR2X5j5k4FZ9Owy',
  'admin'
)
ON CONFLICT (id) DO NOTHING;

-- Demo Project: Projeto ZNIT
INSERT INTO public.projects (id, company_id, name, client_name, address, total_area_m2, building_type, status)
VALUES (
  'proj-znit-demo', 'company-htb', 'Projeto ZNIT', 'ZNIT Engenharia',
  'Demonstração', 102000, 'Industrial', 'active'
)
ON CONFLICT (id) DO NOTHING;
