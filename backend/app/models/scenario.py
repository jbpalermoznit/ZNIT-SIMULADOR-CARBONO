import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Float, Integer, Boolean, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    project_id: Mapped[str] = mapped_column(
        String, ForeignKey("projects.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="draft")  # draft | locked
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_base: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    project: Mapped["Project"] = relationship("Project", backref="scenarios")
    items: Mapped[list["ScenarioItem"]] = relationship(
        "ScenarioItem", back_populates="scenario", cascade="all, delete-orphan"
    )
    result: Mapped["ScenarioResult | None"] = relationship(
        "ScenarioResult", back_populates="scenario", uselist=False, cascade="all, delete-orphan"
    )


class ScenarioItem(Base):
    __tablename__ = "scenario_items"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    scenario_id: Mapped[str] = mapped_column(
        String, ForeignKey("scenarios.id"), nullable=False, index=True
    )
    abc_item_id: Mapped[str] = mapped_column(
        String, ForeignKey("abc_items.id"), nullable=False
    )
    # Fator de emissão (pode diferir do mapping base em cenários alternativos)
    factor_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    factor_unit: Mapped[str | None] = mapped_column(String, nullable=True)
    factor_name: Mapped[str | None] = mapped_column(String, nullable=True)
    source_tier: Mapped[str | None] = mapped_column(String, nullable=True)

    quantity_override: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Emissões calculadas
    emission_kgco2e: Mapped[float | None] = mapped_column(Float, nullable=True)
    emission_scope3_logistics_kgco2e: Mapped[float | None] = mapped_column(Float, nullable=True)

    is_excluded: Mapped[bool] = mapped_column(Boolean, default=False)
    exclusion_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    scenario: Mapped["Scenario"] = relationship("Scenario", back_populates="items")
    abc_item: Mapped["AbcItem"] = relationship("AbcItem")


class ScenarioResult(Base):
    __tablename__ = "scenario_results"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    scenario_id: Mapped[str] = mapped_column(
        String, ForeignKey("scenarios.id"), nullable=False, unique=True
    )
    total_kgco2e: Mapped[float] = mapped_column(Float, default=0.0)
    total_tco2e: Mapped[float] = mapped_column(Float, default=0.0)
    intensity_per_m2: Mapped[float | None] = mapped_column(Float, nullable=True)
    scope1_kgco2e: Mapped[float] = mapped_column(Float, default=0.0)
    scope2_kgco2e: Mapped[float] = mapped_column(Float, default=0.0)
    scope3_materials_kgco2e: Mapped[float] = mapped_column(Float, default=0.0)
    scope3_logistics_kgco2e: Mapped[float] = mapped_column(Float, default=0.0)
    items_total: Mapped[int] = mapped_column(Integer, default=0)
    items_mapped: Mapped[int] = mapped_column(Integer, default=0)
    items_excluded: Mapped[int] = mapped_column(Integer, default=0)
    coverage_pct: Mapped[float] = mapped_column(Float, default=0.0)
    calculated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    scenario: Mapped["Scenario"] = relationship("Scenario", back_populates="result")
