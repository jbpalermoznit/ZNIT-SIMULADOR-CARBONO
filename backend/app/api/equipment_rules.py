"""API endpoints for Equipment Rules (Tipo E — cadeia de conversão)."""
import unicodedata
import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from thefuzz import fuzz
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.models.equipment_rule import EquipmentRule

router = APIRouter(prefix="/equipment-rules", tags=["equipment-rules"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def normalize_keyword(text: str) -> str:
    text = text.lower().strip()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


# Default fuel emission factors (kgCO₂ per unit)
DEFAULT_FUEL_FACTORS = {
    "diesel": {"value": 2.643, "unit": "kgCO₂/L", "source": "BEN 2023", "tier": "ghg_protocol"},
    "gasoline": {"value": 2.303, "unit": "kgCO₂/L", "source": "BEN 2023", "tier": "ghg_protocol"},
    "electric": {"value": 0.0293, "unit": "kgCO₂/kWh", "source": "SIN 2024", "tier": "ghg_protocol"},
    "glp": {"value": 1.536, "unit": "kgCO₂/kg", "source": "BEN 2023", "tier": "ghg_protocol"},
    "none": {"value": 0, "unit": "-", "source": "-", "tier": "none"},
}

# Default consumption per hour by category
DEFAULT_EQUIPMENT_PROFILES = {
    "retroescavadeira": {"fuel": "diesel", "consumption": 12.0, "unit": "L/h", "scope": 1},
    "escavadeira": {"fuel": "diesel", "consumption": 18.0, "unit": "L/h", "scope": 1},
    "caminhão basculante": {"fuel": "diesel", "consumption": 15.0, "unit": "L/h", "scope": 1},
    "caminhão": {"fuel": "diesel", "consumption": 12.0, "unit": "L/h", "scope": 1},
    "pá carregadeira": {"fuel": "diesel", "consumption": 15.0, "unit": "L/h", "scope": 1},
    "rolo compactador": {"fuel": "diesel", "consumption": 10.0, "unit": "L/h", "scope": 1},
    "betoneira": {"fuel": "electric", "consumption": 5.0, "unit": "kWh/h", "scope": 2},
    "máquina de solda": {"fuel": "electric", "consumption": 8.0, "unit": "kWh/h", "scope": 2},
    "guindaste": {"fuel": "diesel", "consumption": 20.0, "unit": "L/h", "scope": 1},
    "bomba de concreto": {"fuel": "diesel", "consumption": 25.0, "unit": "L/h", "scope": 1},
    "gerador": {"fuel": "diesel", "consumption": 10.0, "unit": "L/h", "scope": 1},
    "andaime": {"fuel": "none", "consumption": 0, "unit": "-", "scope": 0},
    "forma": {"fuel": "none", "consumption": 0, "unit": "-", "scope": 0},
}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class EquipmentRuleCreate(BaseModel):
    original_description: str
    category: str
    fuel_type: str  # diesel | gasoline | electric | glp | none
    consumption_per_hour: float
    consumption_unit: str  # L/h | kWh/h | kg/h
    emission_factor_value: float
    emission_factor_unit: str
    emission_factor_source: str
    emission_factor_tier: str
    scope: int = 1
    notes: Optional[str] = None


class EquipmentRuleResponse(BaseModel):
    id: str
    company_id: str
    match_keyword: str
    original_description: str
    category: str
    fuel_type: str
    consumption_per_hour: float
    consumption_unit: str
    emission_factor_value: float
    emission_factor_unit: str
    emission_factor_source: str
    emission_factor_tier: str
    scope: int
    notes: Optional[str]
    times_applied: int
    is_active: bool
    created_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


class EquipmentSuggestion(BaseModel):
    """Suggested equipment profile based on item description."""
    category: str
    fuel_type: str
    consumption_per_hour: float
    consumption_unit: str
    emission_factor_value: float
    emission_factor_unit: str
    emission_factor_source: str
    emission_factor_tier: str
    scope: int
    total_kgco2e: float  # pre-calculated for the given quantity


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[EquipmentRuleResponse])
def list_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(EquipmentRule)
        .filter(
            EquipmentRule.company_id == current_user.company_id,
            EquipmentRule.is_active == True,
        )
        .order_by(EquipmentRule.category, EquipmentRule.created_at.desc())
        .all()
    )


@router.post("", response_model=EquipmentRuleResponse, status_code=201)
def create_rule(
    body: EquipmentRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    keyword = normalize_keyword(body.original_description)
    if not keyword:
        raise HTTPException(400, "Descrição inválida")

    # Upsert: update if exists
    existing = (
        db.query(EquipmentRule)
        .filter(
            EquipmentRule.company_id == current_user.company_id,
            EquipmentRule.match_keyword == keyword,
            EquipmentRule.is_active == True,
        )
        .first()
    )
    if existing:
        existing.category = body.category
        existing.fuel_type = body.fuel_type
        existing.consumption_per_hour = body.consumption_per_hour
        existing.consumption_unit = body.consumption_unit
        existing.emission_factor_value = body.emission_factor_value
        existing.emission_factor_unit = body.emission_factor_unit
        existing.emission_factor_source = body.emission_factor_source
        existing.emission_factor_tier = body.emission_factor_tier
        existing.scope = body.scope
        existing.notes = body.notes
        db.commit()
        db.refresh(existing)
        return existing

    rule = EquipmentRule(
        company_id=current_user.company_id,
        match_keyword=keyword,
        original_description=body.original_description,
        category=body.category,
        fuel_type=body.fuel_type,
        consumption_per_hour=body.consumption_per_hour,
        consumption_unit=body.consumption_unit,
        emission_factor_value=body.emission_factor_value,
        emission_factor_unit=body.emission_factor_unit,
        emission_factor_source=body.emission_factor_source,
        emission_factor_tier=body.emission_factor_tier,
        scope=body.scope,
        notes=body.notes,
        created_by=current_user.id,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/{rule_id}")
def delete_rule(
    rule_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rule = (
        db.query(EquipmentRule)
        .filter(
            EquipmentRule.id == rule_id,
            EquipmentRule.company_id == current_user.company_id,
        )
        .first()
    )
    if not rule:
        raise HTTPException(404, "Regra não encontrada")
    rule.is_active = False
    db.commit()
    return {"message": "Regra desativada"}


@router.get("/suggest/{item_id}", response_model=EquipmentSuggestion)
def suggest_equipment(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Suggest equipment profile for a Tipo E item.

    Checks saved rules first, then falls back to default profiles.
    """
    from app.models.abc_item import AbcItem

    item = db.query(AbcItem).filter(AbcItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item não encontrado")

    desc = item.description
    qty = item.quantity or 0
    keyword = normalize_keyword(desc)

    # 1. Check saved equipment rules
    rules = (
        db.query(EquipmentRule)
        .filter(
            EquipmentRule.company_id == current_user.company_id,
            EquipmentRule.is_active == True,
        )
        .all()
    )
    best_rule = None
    best_score = 0
    for rule in rules:
        if rule.match_keyword == keyword:
            best_rule = rule
            best_score = 100
            break
        score = fuzz.token_set_ratio(keyword, rule.match_keyword)
        if score > best_score and score >= 75:
            best_rule = rule
            best_score = score

    if best_rule:
        total = qty * best_rule.consumption_per_hour * best_rule.emission_factor_value
        return EquipmentSuggestion(
            category=best_rule.category,
            fuel_type=best_rule.fuel_type,
            consumption_per_hour=best_rule.consumption_per_hour,
            consumption_unit=best_rule.consumption_unit,
            emission_factor_value=best_rule.emission_factor_value,
            emission_factor_unit=best_rule.emission_factor_unit,
            emission_factor_source=best_rule.emission_factor_source,
            emission_factor_tier=best_rule.emission_factor_tier,
            scope=best_rule.scope,
            total_kgco2e=total,
        )

    # 2. Fallback: match against default profiles
    desc_lower = desc.lower()
    matched_cat = None
    for cat in DEFAULT_EQUIPMENT_PROFILES:
        if cat in desc_lower:
            matched_cat = cat
            break

    if not matched_cat:
        # Try fuzzy
        for cat in DEFAULT_EQUIPMENT_PROFILES:
            if fuzz.partial_ratio(desc_lower, cat) >= 80:
                matched_cat = cat
                break

    if not matched_cat:
        matched_cat = "caminhão"  # generic fallback

    profile = DEFAULT_EQUIPMENT_PROFILES[matched_cat]
    fuel = DEFAULT_FUEL_FACTORS.get(profile["fuel"], DEFAULT_FUEL_FACTORS["diesel"])

    consumption = profile["consumption"]
    factor = fuel["value"]
    total = qty * consumption * factor

    return EquipmentSuggestion(
        category=matched_cat,
        fuel_type=profile["fuel"],
        consumption_per_hour=consumption,
        consumption_unit=profile["unit"],
        emission_factor_value=factor,
        emission_factor_unit=fuel["unit"],
        emission_factor_source=fuel["source"],
        emission_factor_tier=fuel["tier"],
        scope=profile["scope"],
        total_kgco2e=total,
    )


@router.get("/defaults")
def get_defaults():
    """Return default equipment profiles and fuel factors for the frontend."""
    return {
        "profiles": DEFAULT_EQUIPMENT_PROFILES,
        "fuel_factors": DEFAULT_FUEL_FACTORS,
    }
