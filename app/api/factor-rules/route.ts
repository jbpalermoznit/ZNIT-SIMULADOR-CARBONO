import { NextRequest } from "next/server";
import { supabase } from "@/lib/server/supabase";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import type { AuthUser } from "@/lib/server/auth";
import { normalizeKeyword } from "@/lib/server/keyword";

// ---------------------------------------------------------------------------
// GET /api/factor-rules — list active rules for the company
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  let user: AuthUser;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { data: rules } = await supabase
    .from("factor_rules")
    .select("*")
    .eq("company_id", user.company_id)
    .eq("is_active", true)
    .order("times_applied", { ascending: false })
    .order("created_at", { ascending: false });

  return Response.json(rules ?? []);
}

// ---------------------------------------------------------------------------
// POST /api/factor-rules — create or update a factor rule
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
        { detail: "Descrição inválida para criar regra" },
        { status: 400 }
      );
    }

    // Check if rule already exists for this keyword
    const { data: existing } = await supabase
      .from("factor_rules")
      .select("*")
      .eq("company_id", user.company_id)
      .eq("match_keyword", keyword)
      .eq("is_active", true)
      .single();

    if (existing) {
      // Update existing rule
      const { data: updated, error } = await supabase
        .from("factor_rules")
        .update({
          factor_value: body.factor_value,
          factor_unit: body.factor_unit,
          factor_name: body.factor_name,
          source_tier: body.source_tier,
          source_description: body.source_description ?? null,
          ecoinvent_product_id: body.ecoinvent_product_id ?? null,
          ghg_factor_id: body.ghg_factor_id ?? null,
          cecarbon_id: body.cecarbon_id ?? null,
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
      .from("factor_rules")
      .insert({
        company_id: user.company_id,
        match_keyword: keyword,
        original_description: body.original_description,
        factor_value: body.factor_value,
        factor_unit: body.factor_unit,
        factor_name: body.factor_name,
        source_tier: body.source_tier,
        source_description: body.source_description ?? null,
        ecoinvent_product_id: body.ecoinvent_product_id ?? null,
        ghg_factor_id: body.ghg_factor_id ?? null,
        cecarbon_id: body.cecarbon_id ?? null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return Response.json({ detail: error.message }, { status: 400 });
    }
    return Response.json(rule, { status: 201 });
  } catch (err) {
    console.error("Create factor rule error:", err);
    return Response.json({ detail: "Erro interno" }, { status: 500 });
  }
}
