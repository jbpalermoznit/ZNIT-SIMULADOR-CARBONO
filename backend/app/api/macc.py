"""
API endpoint para cálculo da Curva MACC (Marginal Abatement Cost Curve).

Estratégia rápida: busca todos os EPDs com GWP preenchido em uma única query,
depois cruza com os itens mapeados do projeto para encontrar alternativas
com menor fator de emissão.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.supabase_client import _get
from app.models.user import User
from app.models.abc_item import AbcItem, AbcCurve
from app.models.item_mapping import ItemMapping
from app.services.emission_mapper import extract_keywords, SEARCH_QUERIES, EPD_QUERIES
from app.services.calculator import get_conversion_factor
from thefuzz import fuzz

router = APIRouter(prefix="/macc", tags=["macc"])


def _load_all_epds_with_gwp() -> list[dict]:
    """Load all EPDs that have gwp_a1a3 populated — single Supabase call."""
    return _get("epd_dev", {
        "gwp_a1a3": "not.is.null",
        "limit": "500",
        "order": "titulo",
    })


def _match_epds_to_item(description: str, unit: str, epds: list[dict]) -> list[dict]:
    """Fast local matching of EPDs to an item description using fuzzy search."""
    keywords = extract_keywords(description)
    desc_lower = description.lower()

    # Build search terms from keyword maps
    search_terms: list[str] = []
    for kw in keywords:
        if kw in EPD_QUERIES:
            search_terms.extend(EPD_QUERIES[kw])
        if kw in SEARCH_QUERIES:
            search_terms.extend(SEARCH_QUERIES[kw])
    search_terms = list(set(search_terms))

    matches = []
    for epd in epds:
        gwp = epd.get("gwp_a1a3")
        if gwp is None or float(gwp) <= 0:
            continue

        titulo = (epd.get("titulo") or "").lower()
        info = (epd.get("informacao_produto") or "").lower()
        company = (epd.get("company_name") or "").lower()

        # Quick relevance check: any search term in titulo or info?
        relevant = False
        for term in search_terms:
            t = term.lower()
            if t in titulo or t in info:
                relevant = True
                break

        if not relevant and search_terms:
            # Fuzzy fallback — only if score is decent
            best_score = max(
                fuzz.partial_ratio(desc_lower, titulo),
                fuzz.partial_ratio(desc_lower, info),
            )
            if best_score < 55:
                continue
            score = best_score
        else:
            # Score the match
            score = max(
                fuzz.token_set_ratio(desc_lower, titulo),
                fuzz.token_set_ratio(desc_lower, info),
                fuzz.partial_ratio(desc_lower, titulo),
            )
            # Boost for search term match
            if relevant:
                score = max(score, 75)

        if score < 50:
            continue

        declared_value = float(epd.get("declared_value") or 1)
        factor_per_unit = float(gwp) / declared_value if declared_value > 0 else float(gwp)

        matches.append({
            "epd_id": epd.get("id"),
            "factor_value": round(factor_per_unit, 6),
            "factor_name": epd.get("titulo", ""),
            "factor_source": f"EPD — {epd.get('company_name', '')}",
            "supplier": epd.get("company_name", ""),
            "source_tier": "epd",
            "declared_unit": (epd.get("declared_unit") or "").strip(),
            "score": score,
            "country": epd.get("country") or epd.get("geographical_scopes") or "",
        })

    # Sort by score desc, return top 5
    matches.sort(key=lambda m: m["score"], reverse=True)
    return matches[:5]


@router.get("/{project_id}")
def get_macc_data(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Calcula a curva MACC para um projeto.
    Estratégia: 1 query batch para EPDs, depois matching local por item.
    """
    # Buscar curva ABC mais recente
    curve = (
        db.query(AbcCurve)
        .filter(AbcCurve.project_id == project_id)
        .order_by(AbcCurve.imported_at.desc())
        .first()
    )
    if not curve:
        raise HTTPException(404, "Nenhuma curva ABC encontrada para este projeto")

    # Buscar itens Tipo A mapeados
    items = (
        db.query(AbcItem)
        .filter(
            AbcItem.abc_curve_id == curve.id,
            AbcItem.item_type == "A",
            AbcItem.mapping_status.in_(["auto", "manual"]),
        )
        .order_by(AbcItem.item_order)
        .all()
    )

    if not items:
        return {"bars": [], "kpis": _empty_kpis()}

    # Single batch: load all EPDs with GWP
    all_epds = _load_all_epds_with_gwp()

    bars = []

    for item in items:
        # Baseline mapping
        mapping = (
            db.query(ItemMapping)
            .filter(ItemMapping.abc_item_id == item.id)
            .first()
        )
        if not mapping or mapping.factor_value <= 0:
            continue

        baseline_factor = mapping.factor_value
        baseline_source = mapping.factor_name or mapping.factor_source or "Baseline"

        # Unit conversion: baseline factor_unit → item unit
        baseline_conv = get_conversion_factor(item.unit or "", mapping.factor_unit or "")
        # Baseline emission in kgCO₂e
        baseline_emission_kg = baseline_factor * item.quantity * baseline_conv

        if baseline_emission_kg <= 0:
            continue

        # Match EPDs locally (fast, no HTTP)
        epd_matches = _match_epds_to_item(item.description, item.unit or "", all_epds)

        for candidate in epd_matches:
            alt_factor = candidate["factor_value"]
            if alt_factor <= 0:
                continue

            # Unit conversion for alternative
            alt_conv = get_conversion_factor(item.unit or "", candidate.get("declared_unit", ""))
            alt_emission_kg = alt_factor * item.quantity * alt_conv

            # Skip if alternative emits more or equal
            if alt_emission_kg >= baseline_emission_kg:
                continue

            # Skip if same as baseline
            if candidate.get("factor_name") == mapping.factor_name:
                continue

            # Abatement in kgCO₂e
            abatement_kg = baseline_emission_kg - alt_emission_kg
            if abatement_kg <= 0:
                continue

            # Convert to tCO₂e
            abatement_tco2e = abatement_kg / 1000

            supplier = candidate.get("supplier", "")

            bars.append({
                "id": f"{item.id}_epd_{candidate.get('epd_id', 'x')}",
                "item_description": item.description,
                "item_cost_code": item.cost_code,
                "item_unit_cost": item.unit_cost,
                "item_quantity": item.quantity,
                "baseline_factor": round(baseline_factor, 4),
                "baseline_source": baseline_source,
                "baseline_emission_kg": round(baseline_emission_kg, 2),
                "alternative_factor": round(alt_factor, 4),
                "alternative_name": candidate.get("factor_name", ""),
                "alternative_source": candidate.get("factor_source", ""),
                "alternative_emission_kg": round(alt_emission_kg, 2),
                "supplier": supplier,
                "source_tier": "epd",
                "abatement_tco2e": round(abatement_tco2e, 2),
                "abatement_unit": "tCO₂e",
                "cost_per_tco2e": 0.0,
                "score": candidate.get("score", 0),
                "category": "low",
            })

    # Sort by abatement desc (most impactful first)
    bars.sort(key=lambda b: b["abatement_tco2e"], reverse=True)

    # Deduplicate: best per (item, supplier)
    seen = set()
    unique_bars = []
    for bar in bars:
        key = (bar["item_cost_code"], bar["supplier"])
        if key not in seen:
            seen.add(key)
            unique_bars.append(bar)

    kpis = _compute_kpis(unique_bars)

    return {"bars": unique_bars, "kpis": kpis}


def _empty_kpis() -> dict:
    return {
        "total_abatement": 0,
        "savings_abatement": 0,
        "savings_count": 0,
        "avg_cost": 0,
        "total_alternatives": 0,
    }


def _compute_kpis(bars: list[dict]) -> dict:
    if not bars:
        return _empty_kpis()

    total_abatement = sum(b["abatement_tco2e"] for b in bars)
    savings_bars = [b for b in bars if b["cost_per_tco2e"] < 0]
    savings_abatement = sum(b["abatement_tco2e"] for b in savings_bars)
    costs = [b["cost_per_tco2e"] for b in bars]
    avg_cost = sum(costs) / len(costs) if costs else 0

    return {
        "total_abatement": round(total_abatement, 2),
        "savings_abatement": round(savings_abatement, 2),
        "savings_count": len(savings_bars),
        "avg_cost": round(avg_cost, 2),
        "total_alternatives": len(bars),
    }
