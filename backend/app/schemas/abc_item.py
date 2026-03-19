from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class AbcCurveResponse(BaseModel):
    id: str
    project_id: str
    file_name: str
    imported_at: datetime
    total_items: int
    total_cost: float

    model_config = {"from_attributes": True}


class AbcItemResponse(BaseModel):
    id: str
    abc_curve_id: str
    cost_code: str
    description: str
    adf: Optional[float]
    quantity: float
    unit: str
    unit_cost: float
    total_cost: float
    supplier: Optional[str]
    cost_pct: float
    cumulative_pct: float
    abc_class: str
    item_type: str
    item_order: int
    mapping_status: str
    classification_note: Optional[str]
    parent_item_id: Optional[str] = None
    # Dados do mapping (preenchidos via join)
    factor_name: Optional[str] = None
    factor_value: Optional[float] = None
    factor_unit: Optional[str] = None
    source_tier: Optional[str] = None
    confidence: Optional[str] = None

    model_config = {"from_attributes": True}


class UploadResult(BaseModel):
    abc_curve_id: str
    file_name: str
    total_items: int
    total_cost: float
    type_summary: dict[str, int]
    class_summary: dict[str, int]
    warnings: list[str]
