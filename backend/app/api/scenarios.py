"""
API endpoints para cenários e cálculo de emissões.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.scenario import Scenario, ScenarioItem, ScenarioResult
from app.models.abc_item import AbcItem
from app.schemas.scenario import (
    ScenarioCreate,
    ScenarioResponse,
    ScenarioDetailResponse,
    ScenarioItemResponse,
    ScenarioResultResponse,
)
from app.services.calculator import create_base_scenario, recalculate_scenario

router = APIRouter(tags=["scenarios"])


# ---------------------------------------------------------------------------
# Listar cenários de um projeto
# ---------------------------------------------------------------------------

@router.get("/projects/{project_id}/scenarios", response_model=list[ScenarioResponse])
def list_scenarios(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scenarios = (
        db.query(Scenario)
        .filter(Scenario.project_id == project_id)
        .order_by(Scenario.is_base.desc(), Scenario.created_at)
        .all()
    )
    results = []
    for s in scenarios:
        item_count = db.query(ScenarioItem).filter(ScenarioItem.scenario_id == s.id).count()
        result = db.query(ScenarioResult).filter(ScenarioResult.scenario_id == s.id).first()
        results.append(ScenarioResponse(
            id=s.id,
            project_id=s.project_id,
            name=s.name,
            description=s.description,
            status=s.status,
            version=s.version,
            is_base=s.is_base,
            created_at=s.created_at,
            items_count=item_count,
            result=ScenarioResultResponse.model_validate(result) if result else None,
        ))
    return results


# ---------------------------------------------------------------------------
# Criar Cenário Base (auto)
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/scenarios/base", response_model=ScenarioResponse)
def create_base(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cria ou recria o Cenário Base a partir dos mapeamentos atuais."""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.company_id == current_user.company_id,
    ).first()
    if not project:
        raise HTTPException(404, "Projeto não encontrado")

    try:
        scenario = create_base_scenario(project_id, current_user.id, db)
    except ValueError as e:
        raise HTTPException(400, str(e))

    # Reload
    db.refresh(scenario)
    result = db.query(ScenarioResult).filter(ScenarioResult.scenario_id == scenario.id).first()
    item_count = db.query(ScenarioItem).filter(ScenarioItem.scenario_id == scenario.id).count()

    return ScenarioResponse(
        id=scenario.id,
        project_id=scenario.project_id,
        name=scenario.name,
        description=scenario.description,
        status=scenario.status,
        version=scenario.version,
        is_base=scenario.is_base,
        created_at=scenario.created_at,
        items_count=item_count,
        result=ScenarioResultResponse.model_validate(result) if result else None,
    )


# ---------------------------------------------------------------------------
# Criar cenário alternativo
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/scenarios", response_model=ScenarioResponse, status_code=201)
def create_scenario(
    project_id: str,
    body: ScenarioCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.company_id == current_user.company_id,
    ).first()
    if not project:
        raise HTTPException(404, "Projeto não encontrado")

    scenario = Scenario(
        project_id=project_id,
        name=body.name,
        description=body.description,
        is_base=False,
        created_by=current_user.id,
    )
    db.add(scenario)
    db.flush()

    # Se duplicar de outro cenário, copiar items
    if body.source_scenario_id:
        source_items = (
            db.query(ScenarioItem)
            .filter(ScenarioItem.scenario_id == body.source_scenario_id)
            .all()
        )
        for si in source_items:
            new_si = ScenarioItem(
                scenario_id=scenario.id,
                abc_item_id=si.abc_item_id,
                factor_value=si.factor_value,
                factor_unit=si.factor_unit,
                factor_name=si.factor_name,
                source_tier=si.source_tier,
                quantity_override=si.quantity_override,
                emission_kgco2e=si.emission_kgco2e,
                emission_scope3_logistics_kgco2e=si.emission_scope3_logistics_kgco2e,
                is_excluded=si.is_excluded,
                exclusion_reason=si.exclusion_reason,
            )
            db.add(new_si)

    db.commit()
    db.refresh(scenario)

    item_count = db.query(ScenarioItem).filter(ScenarioItem.scenario_id == scenario.id).count()
    return ScenarioResponse(
        id=scenario.id,
        project_id=scenario.project_id,
        name=scenario.name,
        description=scenario.description,
        status=scenario.status,
        version=scenario.version,
        is_base=scenario.is_base,
        created_at=scenario.created_at,
        items_count=item_count,
        result=None,
    )


# ---------------------------------------------------------------------------
# Detalhe de um cenário (com itens e resultado)
# ---------------------------------------------------------------------------

@router.get("/scenarios/{scenario_id}", response_model=ScenarioDetailResponse)
def get_scenario(
    scenario_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(404, "Cenário não encontrado")

    result = db.query(ScenarioResult).filter(ScenarioResult.scenario_id == scenario_id).first()

    # Buscar items com dados do AbcItem
    scenario_items = (
        db.query(ScenarioItem, AbcItem)
        .join(AbcItem, ScenarioItem.abc_item_id == AbcItem.id)
        .filter(ScenarioItem.scenario_id == scenario_id)
        .order_by(AbcItem.item_order)
        .all()
    )

    items_response = []
    for si, ai in scenario_items:
        emission_tco2e = (si.emission_kgco2e / 1000) if si.emission_kgco2e else None
        items_response.append(ScenarioItemResponse(
            id=si.id,
            abc_item_id=si.abc_item_id,
            cost_code=ai.cost_code,
            description=ai.description,
            item_type=ai.item_type,
            abc_class=ai.abc_class,
            quantity=si.quantity_override or ai.quantity,
            unit=ai.unit,
            total_cost=ai.total_cost,
            factor_value=si.factor_value,
            factor_unit=si.factor_unit,
            factor_name=si.factor_name,
            source_tier=si.source_tier,
            emission_kgco2e=si.emission_kgco2e,
            emission_tco2e=emission_tco2e,
            emission_scope3_logistics_kgco2e=si.emission_scope3_logistics_kgco2e,
            is_excluded=si.is_excluded,
            exclusion_reason=si.exclusion_reason,
        ))

    return ScenarioDetailResponse(
        id=scenario.id,
        project_id=scenario.project_id,
        name=scenario.name,
        description=scenario.description,
        status=scenario.status,
        version=scenario.version,
        is_base=scenario.is_base,
        created_at=scenario.created_at,
        items_count=len(items_response),
        result=ScenarioResultResponse.model_validate(result) if result else None,
        items=items_response,
    )


# ---------------------------------------------------------------------------
# Recalcular emissões de um cenário
# ---------------------------------------------------------------------------

@router.post("/scenarios/{scenario_id}/calculate", response_model=ScenarioResultResponse)
def calculate(
    scenario_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        result = recalculate_scenario(scenario_id, db)
    except ValueError as e:
        raise HTTPException(400, str(e))

    return ScenarioResultResponse.model_validate(result)
