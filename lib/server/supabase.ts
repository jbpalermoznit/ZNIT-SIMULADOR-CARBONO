import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  console.warn("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
}

/** Supabase client for app data (public schema). Uses service_role key — server-side only. */
export const supabase = createClient(supabaseUrl, serviceRoleKey, {
  db: { schema: "public" },
  auth: { persistSession: false },
});

/** Supabase client for emission factor data (backend schema). Server-side only. */
export const supabaseEmission = createClient(supabaseUrl, serviceRoleKey, {
  db: { schema: "backend" },
  auth: { persistSession: false },
});
