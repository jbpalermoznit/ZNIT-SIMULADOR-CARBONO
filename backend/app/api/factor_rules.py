"""API endpoints for Factor Rules (Premissa Library — simplified)."""
import unicodedata
import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.models.factor_rule import FactorRule

router = APIRouter(prefix="/factor-rules", tags=["factor-rules"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def normalize_keyword(text: str) -> str:
    """Normaliza texto para matching: lowercase, sem acentos, sem chars especiais."""
    text = text.lower().strip()
    # Remove acentos
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    # Remove chars especiais, mantém espaços e alfanuméricos
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    # Normaliza espaços
    text = re.sub(r"\s+", " ", text).strip()
    return text


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class FactorRuleCreate(BaseModel):
    original_description: str
    factor_value: float
    factor_unit: str
    factor_name: str
    source_tier: str
    source_description: Optional[str] = None
    ecoinvent_product_id: Optional[str] = None
    ghg_factor_id: Optional[int] = None
    cecarbon_id: Optional[int] = None


class FactorRuleResponse(BaseModel):
    id: str
    company_id: str
    match_keyword: str
    original_description: str
    factor_value: float
    factor_unit: str
    factor_name: str
    source_tier: str
    source_description: Optional[str]
    times_applied: int
    times_overridden: int
    is_active: bool
    created_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[FactorRuleResponse])
def list_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista todas as regras ativas da empresa."""
    rules = (
        db.query(FactorRule)
        .filter(
            FactorRule.company_id == current_user.company_id,
            FactorRule.is_active == True,
        )
        .order_by(FactorRule.times_applied.desc(), FactorRule.created_at.desc())
        .all()
    )
    return rules


@router.post("", response_model=FactorRuleResponse, status_code=201)
def create_rule(
    body: FactorRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cria uma regra de fator de emissão para reutilização."""
    keyword = normalize_keyword(body.original_description)
    if not keyword:
        raise HTTPException(400, "Descrição inválida para criar regra")

    # Check if rule already exists for this keyword
    existing = (
        db.query(FactorRule)
        .filter(
            FactorRule.company_id == current_user.company_id,
            FactorRule.match_keyword == keyword,
            FactorRule.is_active == True,
        )
        .first()
    )
    if existing:
        # Update existing rule
        existing.factor_value = body.factor_value
        existing.factor_unit = body.factor_unit
        existing.factor_name = body.factor_name
        existing.source_tier = body.source_tier
        existing.source_description = body.source_description
        existing.ecoinvent_product_id = body.ecoinvent_product_id
        existing.ghg_factor_id = body.ghg_factor_id
        existing.cecarbon_id = body.cecarbon_id
        db.commit()
        db.refresh(existing)
        return existing

    rule = FactorRule(
        company_id=current_user.company_id,
        match_keyword=keyword,
        original_description=body.original_description,
        factor_value=body.factor_value,
        factor_unit=body.factor_unit,
        factor_name=body.factor_name,
        source_tier=body.source_tier,
        source_description=body.source_description,
        ecoinvent_product_id=body.ecoinvent_product_id,
        ghg_factor_id=body.ghg_factor_id,
        cecarbon_id=body.cecarbon_id,
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
    """Desativa uma regra (soft delete)."""
    rule = (
        db.query(FactorRule)
        .filter(
            FactorRule.id == rule_id,
            FactorRule.company_id == current_user.company_id,
        )
        .first()
    )
    if not rule:
        raise HTTPException(404, "Regra não encontrada")

    rule.is_active = False
    db.commit()
    return {"message": "Regra desativada"}


@router.post("/{rule_id}/increment-applied")
def increment_applied(
    rule_id: str,
    db: Session = Depends(get_db),
):
    """Incrementa o contador de vezes que a regra foi aplicada (chamado pelo mapper)."""
    rule = db.query(FactorRule).filter(FactorRule.id == rule_id).first()
    if rule:
        rule.times_applied = (rule.times_applied or 0) + 1
        db.commit()
    return {"ok": True}
