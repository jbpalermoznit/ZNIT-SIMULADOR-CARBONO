from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ProjectCreate(BaseModel):
    name: str
    client_name: Optional[str] = None
    address: Optional[str] = None
    total_area_m2: Optional[float] = None
    building_type: Optional[str] = None


class ProjectResponse(BaseModel):
    id: str
    company_id: str
    name: str
    client_name: Optional[str]
    address: Optional[str]
    total_area_m2: Optional[float]
    building_type: Optional[str]
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectWithStats(ProjectResponse):
    """Project enriched with scenario/items stats for dashboard."""
    total_tco2e: Optional[float] = None
    intensity_kgco2e_per_m2: Optional[float] = None
    coverage_pct: Optional[float] = None
    scenarios_count: int = 0
    items_count: int = 0
