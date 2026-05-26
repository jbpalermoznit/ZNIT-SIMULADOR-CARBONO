/**
 * Vitest setup — runs before each test file.
 *
 * Some modules under lib/server/ (e.g. calculator.ts) eagerly construct a
 * Supabase client at import time. The pure helpers we test never call it,
 * but the createClient call validates the URL and crashes the module load
 * if NEXT_PUBLIC_SUPABASE_URL is absent. We inject dummy values here so
 * the modules load cleanly. Any test that actually exercises a DB call
 * should override these with a real or mocked client.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://test.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.NEXT_PUBLIC_EMISSION_SUPABASE_URL = "http://test.local";
process.env.EMISSION_SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
