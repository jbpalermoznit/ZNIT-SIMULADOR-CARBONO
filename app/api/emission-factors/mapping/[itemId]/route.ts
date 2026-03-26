/**
 * GET/PUT /api/emission-factors/mapping/[itemId]
 * Get or confirm/update the emission factor mapping for an item.
 * Port of backend/app/api/emission_factors.py — get_mapping, confirm_mapping
 */

import { NextRequest } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/server/auth";
import { supabase } from "@/lib/server/supabase";
import {
  getEcoinventById,
  getGhgById,
  getEpdById,
} from "@/lib/server/supabase-emission";

// ---------------------------------------------------------------------------
// GET — current mapping for an item
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { itemId } = await params;

  const { data: mapping } = await supabase
    .from("item_mappings")
    .select("*")
    .eq("abc_item_id", itemId)
    .limit(1)
    .maybeSingle();

  if (!mapping) {
    return Response.json(null);
  }

  return Response.json({
    id: mapping.id,
    abc_item_id: mapping.abc_item_id,
    source_tier: mapping.source_tier,
    factor_value: mapping.factor_value,
    factor_unit: mapping.factor_unit,
    factor_name: mapping.factor_name,
    factor_source: mapping.factor_source,
    confidence: mapping.confidence,
    similarity_score: mapping.similarity_score,
    mapped_by: mapping.mapped_by,
    notes: mapping.notes,
  });
}

// ---------------------------------------------------------------------------
// PUT — confirm or create manual mapping
// ---------------------------------------------------------------------------

interface MappingConfirmBody {
  source_tier: string;
  factor_value?: number | null;
  factor_unit?: string;
  factor_name?: string;
  ecoinvent_product_id?: string | null;
  ecoinvent_activity_id?: string | null;
  ghg_factor_id?: number | null;
  epd_id?: number | null;
  custom_factor_source?: string | null;
  distance_km?: number | null;
  transport_modal?: string | null;
  exclusion_justification?: string | null;
  notes?: string | null;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  let user;
  try {
    user = await getCurrentUser(req);
  } catch {
    return unauthorized();
  }

  const { itemId } = await params;
  const body: MappingConfirmBody = await req.json();

  // Check item exists
  const { data: item, error: itemErr } = await supabase
    .from("abc_items")
    .select("id")
    .eq("id", itemId)
    .single();

  if (itemErr || !item) {
    return Response.json({ detail: "Item não encontrado" }, { status: 404 });
  }

  // Remove existing mapping
  await supabase.from("item_mappings").delete().eq("abc_item_id", itemId);

  let mappingData: Record<string, unknown>;

  if (body.source_tier === "excluded") {
    if (!body.exclusion_justification) {
      return Response.json(
        { detail: "Justificativa obrigatória para exclusão" },
        { status: 400 }
      );
    }
    mappingData = {
      abc_item_id: itemId,
      source_tier: "excluded",
      factor_value: 0.0,
      factor_unit: "kg CO2-Eq",
      factor_name: "Excluído",
      mapped_by: "excluded",
      exclusion_justification: body.exclusion_justification,
      notes: body.notes ?? null,
    };

    await supabase
      .from("abc_items")
      .update({ mapping_status: "excluded" })
      .eq("id", itemId);
  } else {
    if (body.factor_value == null) {
      return Response.json(
        { detail: "factor_value obrigatório" },
        { status: 400 }
      );
    }

    let factorName = body.factor_name ?? "";
    let factorSource = body.custom_factor_source ?? "";

    // Enrich with Supabase data if needed
    if (
      body.source_tier === "ecoinvent" &&
      body.ecoinvent_product_id
    ) {
      const row = await getEcoinventById(
        body.ecoinvent_product_id,
        body.ecoinvent_activity_id ?? ""
      );
      if (row) {
        factorName = factorName || (row.product_name as string) ?? "";
        factorSource = `Ecoinvent — ${(row.activity_name as string) ?? ""}`;
      }
    } else if (
      body.source_tier === "ghg_protocol" &&
      body.ghg_factor_id
    ) {
      const row = await getGhgById(body.ghg_factor_id);
      if (row) {
        factorName = factorName || (row.produto as string) ?? "";
        factorSource = `GHG Protocol BR ${(row.versao_ghg as string) ?? ""}`;
      }
    } else if (body.source_tier === "epd" && body.epd_id) {
      const row = await getEpdById(body.epd_id);
      if (row) {
        factorName = factorName || (row.titulo as string) ?? "";
        const company = (row.company_name as string) ?? "";
        factorSource = company ? `EPD — ${company}` : "EPD";
      }
    }

    mappingData = {
      abc_item_id: itemId,
      source_tier: body.source_tier,
      ecoinvent_product_id: body.ecoinvent_product_id ?? null,
      ecoinvent_activity_id: body.ecoinvent_activity_id ?? null,
      ghg_factor_id: body.ghg_factor_id ?? null,
      epd_id: body.epd_id ?? null,
      factor_value: body.factor_value,
      factor_unit: body.factor_unit ?? "kgCO2e",
      factor_name: factorName,
      factor_source: factorSource,
      product_unit: null,
      confidence: "high",
      mapped_by:
        body.source_tier !== "user_custom" ? user.id : "user_custom",
      custom_factor_source: body.custom_factor_source ?? null,
      distance_km: body.distance_km ?? null,
      transport_modal: body.transport_modal ?? null,
      notes: body.notes ?? null,
    };

    await supabase
      .from("abc_items")
      .update({ mapping_status: "manual" })
      .eq("id", itemId);
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("item_mappings")
    .insert(mappingData)
    .select()
    .single();

  if (insertErr || !inserted) {
    return Response.json(
      { detail: `Erro ao salvar mapeamento: ${insertErr?.message}` },
      { status: 500 }
    );
  }

  return Response.json({
    id: inserted.id,
    abc_item_id: inserted.abc_item_id,
    source_tier: inserted.source_tier,
    factor_value: inserted.factor_value,
    factor_unit: inserted.factor_unit,
    factor_name: inserted.factor_name,
    factor_source: inserted.factor_source,
    confidence: inserted.confidence,
    similarity_score: inserted.similarity_score,
    mapped_by: inserted.mapped_by,
    notes: inserted.notes,
  });
}
