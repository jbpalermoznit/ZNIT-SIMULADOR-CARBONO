import { NextRequest } from "next/server";
import { supabase } from "@/lib/server/supabase";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import type { AuthUser } from "@/lib/server/auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeKeyword(text: string): string {
  let t = text.toLowerCase().trim();
  t = t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  t = t.replace(/[^a-z0-9\s]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

// ---------------------------------------------------------------------------
// GET /api/equipment-rules — list active rules
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  let user: AuthUser;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { data: rules } = await supabase
    .from("equipment_rules")
    .select("*")
    .eq("company_id", user.company_id)
    .eq("is_active", true)
    .order("category")
    .order("created_at", { ascending: false });

  return Response.json(rules ?? []);
}

// ---------------------------------------------------------------------------
// POST /api/equipment-rules — create or update equipment rule
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  let user: AuthUser;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  try {
    const body = await req.json();

    const keyword = normalizeKeyword(body.original_description ?? "");
    if (!keyword) {
      return Response.json(
        { detail: "Descrição inválida" },
        { status: 400 }
      );
    }

    // Upsert: update if rule with same keyword exists
    const { data: existing } = await supabase
      .from("equipment_rules")
      .select("*")
      .eq("company_id", user.company_id)
      .eq("match_keyword", keyword)
      .eq("is_active", true)
      .single();

    if (existing) {
      const { data: updated, error } = await supabase
        .from("equipment_rules")
        .update({
          category: body.category,
          fuel_type: body.fuel_type,
          consumption_per_hour: body.consumption_per_hour,
          consumption_unit: body.consumption_unit,
          emission_factor_value: body.emission_factor_value,
          emission_factor_unit: body.emission_factor_unit,
          emission_factor_source: body.emission_factor_source,
          emission_factor_tier: body.emission_factor_tier,
          scope: body.scope ?? 1,
          notes: body.notes ?? null,
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        return Response.json({ detail: error.message }, { status: 400 });
      }
      return Response.json(updated);
    }

    // Create new rule
    const { data: rule, error } = await supabase
      .from("equipment_rules")
      .insert({
        company_id: user.company_id,
        match_keyword: keyword,
        original_description: body.original_description,
        category: body.category,
        fuel_type: body.fuel_type,
        consumption_per_hour: body.consumption_per_hour,
        consumption_unit: body.consumption_unit,
        emission_factor_value: body.emission_factor_value,
        emission_factor_unit: body.emission_factor_unit,
        emission_factor_source: body.emission_factor_source,
        emission_factor_tier: body.emission_factor_tier,
        scope: body.scope ?? 1,
        notes: body.notes ?? null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return Response.json({ detail: error.message }, { status: 400 });
    }
    return Response.json(rule, { status: 201 });
  } catch (err) {
    console.error("Create equipment rule error:", err);
    return Response.json({ detail: "Erro interno" }, { status: 500 });
  }
}
