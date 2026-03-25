"""
API endpoints para busca de fatores de emissão e mapeamento de itens.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.core.auth import get_current_user
from app.core import supabase_client
from app.models.user import User
from app.models.abc_item import AbcItem
from app.models.item_mapping import ItemMapping
from app.schemas.emission_factor import (
    EcoinventResult,
    GhgResult,
    CecarbonResult,
    EpdCatalogResult,
    EmissionSearchResponse,
    MappingConfirmRequest,
    MappingResponse,
)
from app.services.emission_mapper import auto_match_item, extract_keywords, _build_search_queries

router = APIRouter(prefix="/emission-factors", tags=["emission-factors"])


# ---------------------------------------------------------------------------
# Busca unificada
# ---------------------------------------------------------------------------

@router.get("/search", response_model=EmissionSearchResponse)
def search_factors(
    q: str = Query(..., min_length=2, description="Termo de busca"),
    tier: Optional[str] = Query(None, description="Filtrar por tier: ecoinvent,ghg_protocol,epd_catalog"),
    limit: int = Query(10, le=50),
    current_user: User = Depends(get_current_user),
):
    """Busca unificada em GHG Protocol, CECarbon, Ecoinvent e catálogo de EPDs."""
    tiers = tier.split(",") if tier else ["ghg_protocol", "cecarbon", "ecoinvent", "epd_catalog"]

    ecoinvent_results = []
    ghg_results = []
    cecarbon_results = []
    epd_results = []

    if "ghg_protocol" in tiers:
        try:
            rows = supabase_client.search_ghg(q, limit=limit)
            ghg_results = [GhgResult.from_supabase(r) for r in rows]
        except Exception as e:
            print(f"GHG search error: {e}")

    if "cecarbon" in tiers:
        try:
            rows = supabase_client.search_cecarbon(q, limit=limit)
            cecarbon_results = [CecarbonResult.from_supabase(r) for r in rows
                                if r.get("fator de emissão (kgCO2)") and float(r.get("fator de emissão (kgCO2)") or 0) > 0
                                and r.get("Descrição fator de emissao", "") != "0"]
        except Exception as e:
            print(f"CECarbon search error: {e}")

    if "ecoinvent" in tiers:
        try:
            keywords = extract_keywords(q)
            search_queries, _ = _build_search_queries(keywords)
            all_queries = list(set([q] + search_queries))
            seen_ids = set()
            for sq in all_queries[:4]:
                rows = supabase_client.search_ecoinvent(sq, limit=limit)
                for r in rows:
                    key = (r.get("product_id"), r.get("activity_id"))
                    if key not in seen_ids:
                        seen_ids.add(key)
                        ecoinvent_results.append(EcoinventResult.from_supabase(r))
            ecoinvent_results = ecoinvent_results[:limit]
        except Exception as e:
            print(f"Ecoinvent search error: {e}")

    if "epd_catalog" in tiers:
        try:
            rows = supabase_client.search_epd_catalog(q, limit=limit)
            epd_results = [EpdCatalogResult.from_supabase(r) for r in rows]
        except Exception as e:
            print(f"EPD catalog search error: {e}")

    return EmissionSearchResponse(
        ecoinvent=ecoinvent_results,
        ghg_protocol=ghg_results,
        cecarbon=cecarbon_results,
        epd_catalog=epd_results,
    )


# ---------------------------------------------------------------------------
# Auto-match para um item
# ---------------------------------------------------------------------------

@router.get("/auto-match/{item_id}")
def auto_match(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Busca automática do melhor fator de emissão para um item da curva ABC."""
    item = db.query(AbcItem).filter(AbcItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item não encontrado")

    result = auto_match_item(item.description, item.unit, company_id=current_user.company_id)
    return result


# ---------------------------------------------------------------------------
# Mapeamento em lote (todos itens Tipo A pendentes)
# ---------------------------------------------------------------------------

@router.post("/auto-map/{project_id}")
def auto_map_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Executa auto-match para todos os itens Tipo A pendentes do projeto."""
    from app.models.abc_item import AbcCurve

    # Buscar curva mais recente
    curve = (
        db.query(AbcCurve)
        .filter(AbcCurve.project_id == project_id)
        .order_by(AbcCurve.imported_at.desc())
        .first()
    )
    if not curve:
        raise HTTPException(404, "Nenhuma curva ABC encontrada")

    # Contar itens já mapeados
    already_mapped = (
        db.query(AbcItem)
        .filter(
            AbcItem.abc_curve_id == curve.id,
            AbcItem.item_type == "A",
            AbcItem.mapping_status.in_(["auto", "manual"]),
        )
        .count()
    )

    # Itens Tipo A pendentes
    items = (
        db.query(AbcItem)
        .filter(
            AbcItem.abc_curve_id == curve.id,
            AbcItem.item_type == "A",
            AbcItem.mapping_status == "pending",
        )
        .order_by(AbcItem.item_order)
        .all()
    )

    mapped_count = 0
    suggested_count = 0
    pending_count = 0
    results = []

    for item in items:
        match = auto_match_item(item.description, item.unit, company_id=current_user.company_id)
        best = match.get("best")
        confidence = match.get("confidence")

        if best and best.get("factor_value", 0) > 0:
            # Criar mapeamento para qualquer score > 0
            mapping = ItemMapping(
                abc_item_id=item.id,
                source_tier=best["source_tier"],
                ecoinvent_product_id=best.get("ecoinvent_product_id"),
                ecoinvent_activity_id=best.get("ecoinvent_activity_id"),
                ghg_factor_id=best.get("ghg_factor_id"),
                factor_value=best["factor_value"],
                factor_unit=best["factor_unit"],
                product_unit=best.get("product_unit", ""),
                factor_name=best["factor_name"],
                factor_source=best.get("factor_source"),
                confidence=confidence,
                similarity_score=best["score"] / 100.0,
                mapped_by="rule" if best["source_tier"] == "rule" else "auto",
            )
            db.add(mapping)

            if confidence == "high":
                item.mapping_status = "auto"
                mapped_count += 1
            else:
                # medium or low — needs review
                item.mapping_status = "manual"
                suggested_count += 1
        else:
            pending_count += 1

        results.append({
            "item_id": item.id,
            "description": item.description,
            "confidence": confidence,
            "best_match": best["factor_name"] if best else None,
            "score": best["score"] if best else 0,
        })

    db.commit()

    return {
        "total_items": len(items),
        "auto_mapped": mapped_count,
        "suggested": suggested_count,
        "pending": pending_count,
        "already_mapped": already_mapped,
        "details": results,
    }


# ---------------------------------------------------------------------------
# Confirmar / editar mapeamento manualmente
# ---------------------------------------------------------------------------

@router.put("/mapping/{item_id}", response_model=MappingResponse)
def confirm_mapping(
    item_id: str,
    body: MappingConfirmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Confirmar ou criar mapeamento manual para um item."""
    item = db.query(AbcItem).filter(AbcItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item não encontrado")

    # Remover mapeamento anterior se existir
    db.query(ItemMapping).filter(ItemMapping.abc_item_id == item_id).delete()

    if body.source_tier == "excluded":
        if not body.exclusion_justification:
            raise HTTPException(400, "Justificativa obrigatória para exclusão")
        mapping = ItemMapping(
            abc_item_id=item_id,
            source_tier="excluded",
            factor_value=0.0,
            factor_unit="kg CO2-Eq",
            factor_name="Excluído",
            mapped_by="excluded",
            exclusion_justification=body.exclusion_justification,
            notes=body.notes,
        )
        item.mapping_status = "excluded"
    else:
        if body.factor_value is None:
            raise HTTPException(400, "factor_value obrigatório")

        # Enriquecer com dados do Supabase se necessário
        factor_name = body.factor_name or ""
        factor_source = body.custom_factor_source or ""

        if body.source_tier == "ecoinvent" and body.ecoinvent_product_id:
            row = supabase_client.get_ecoinvent_by_id(
                body.ecoinvent_product_id, body.ecoinvent_activity_id or ""
            )
            if row:
                factor_name = factor_name or row.get("product_name", "")
                factor_source = f"Ecoinvent — {row.get('activity_name', '')}"

        elif body.source_tier == "ghg_protocol" and body.ghg_factor_id:
            row = supabase_client.get_ghg_by_id(body.ghg_factor_id)
            if row:
                factor_name = factor_name or row.get("produto", "")
                factor_source = f"GHG Protocol BR {row.get('versao_ghg', '')}"

        elif body.source_tier == "epd" and body.epd_id:
            row = supabase_client.get_epd_by_id(body.epd_id)
            if row:
                factor_name = factor_name or row.get("titulo", "")
                company = row.get("company_name", "")
                factor_source = f"EPD — {company}" if company else "EPD"

        mapping = ItemMapping(
            abc_item_id=item_id,
            source_tier=body.source_tier,
            ecoinvent_product_id=body.ecoinvent_product_id,
            ecoinvent_activity_id=body.ecoinvent_activity_id,
            ghg_factor_id=body.ghg_factor_id,
            epd_id=body.epd_id,
            factor_value=body.factor_value,
            factor_unit=body.factor_unit,
            factor_name=factor_name,
            factor_source=factor_source,
            product_unit=None,
            confidence="high",
            mapped_by=current_user.id if body.source_tier != "user_custom" else "user_custom",
            custom_factor_source=body.custom_factor_source,
            distance_km=body.distance_km,
            transport_modal=body.transport_modal,
            notes=body.notes,
        )
        item.mapping_status = "manual"

    db.add(mapping)
    db.commit()
    db.refresh(mapping)

    return MappingResponse(
        id=mapping.id,
        abc_item_id=mapping.abc_item_id,
        source_tier=mapping.source_tier,
        factor_value=mapping.factor_value,
        factor_unit=mapping.factor_unit,
        factor_name=mapping.factor_name,
        factor_source=mapping.factor_source,
        confidence=mapping.confidence,
        similarity_score=mapping.similarity_score,
        mapped_by=mapping.mapped_by,
        notes=mapping.notes,
    )


# ---------------------------------------------------------------------------
# Consultar mapeamento de um item
# ---------------------------------------------------------------------------

@router.get("/mapping/{item_id}", response_model=Optional[MappingResponse])
def get_mapping(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retorna o mapeamento atual de um item (ou null)."""
    mapping = (
        db.query(ItemMapping)
        .filter(ItemMapping.abc_item_id == item_id)
        .first()
    )
    if not mapping:
        return None

    return MappingResponse(
        id=mapping.id,
        abc_item_id=mapping.abc_item_id,
        source_tier=mapping.source_tier,
        factor_value=mapping.factor_value,
        factor_unit=mapping.factor_unit,
        factor_name=mapping.factor_name,
        factor_source=mapping.factor_source,
        confidence=mapping.confidence,
        similarity_score=mapping.similarity_score,
        mapped_by=mapping.mapped_by,
        notes=mapping.notes,
    )
