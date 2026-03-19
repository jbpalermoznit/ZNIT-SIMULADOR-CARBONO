from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ScenarioCreate(BaseModel):
    name: str
    description: Optional[str] = None
    source_scenario_id: Optional[str] = None  # duplicar de outro cenário


class ScenarioItemResponse(BaseModel):
    id: str
    abc_item_id: str
    cost_code: str
    description: str
    item_type: str
    abc_class: str
    quantity: float
    unit: str
    total_cost: float
    factor_value: Optional[float] = None
    factor_unit: Optional[str] = None
    factor_name: Optional[str] = None
    source_tier: Optional[str] = None
    emission_kgco2e: Optional[float] = None
    emission_tco2e: Optional[float] = None
    emission_scope3_logistics_kgco2e: Optional[float] = None
    is_excluded: bool = False
    exclusion_reason: Optional[str] = None


class ScenarioResultResponse(BaseModel):
    id: str
    total_kgco2e: float
    total_tco2e: float
    intensity_per_m2: Optional[float] = None
    scope1_kgco2e: float
    scope2_kgco2e: float
    scope3_materials_kgco2e: float
    scope3_logistics_kgco2e: float
    items_total: int
    items_mapped: int
    items_excluded: int
    coverage_pct: float
    calculated_at: datetime

    class Config:
        from_attributes = True


class ScenarioResponse(BaseModel):
    id: str
    project_id: str
    name: str
    description: Optional[str] = None
    status: str
    version: int
    is_base: bool
    created_at: datetime
    result: Optional[ScenarioResultResponse] = None
    items_count: Optional[int] = None

    class Config:
        from_attributes = True


class ScenarioDetailResponse(ScenarioResponse):
    items: list[ScenarioItemResponse] = []
