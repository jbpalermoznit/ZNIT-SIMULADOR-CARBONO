import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Float, Integer, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class AbcCurve(Base):
    __tablename__ = "abc_curves"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String, ForeignKey("projects.id"), nullable=False)
    file_name: Mapped[str] = mapped_column(String, nullable=False)
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    imported_by_user_id: Mapped[str | None] = mapped_column(String, nullable=True)
    total_items: Mapped[int] = mapped_column(Integer, default=0)
    total_cost: Mapped[float] = mapped_column(Float, default=0.0)

    project: Mapped["Project"] = relationship("Project", back_populates="abc_curves")
    items: Mapped[list["AbcItem"]] = relationship(
        "AbcItem", back_populates="abc_curve", cascade="all, delete-orphan"
    )


class AbcItem(Base):
    __tablename__ = "abc_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    abc_curve_id: Mapped[str] = mapped_column(String, ForeignKey("abc_curves.id"), nullable=False)

    # Dados brutos da planilha
    cost_code: Mapped[str] = mapped_column(String, nullable=False, index=True)
    description: Mapped[str] = mapped_column(String, nullable=False)
    adf: Mapped[float | None] = mapped_column(Float, nullable=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String, nullable=False)
    unit_cost: Mapped[float] = mapped_column(Float, nullable=False)
    total_cost: Mapped[float] = mapped_column(Float, nullable=False)
    supplier: Mapped[str | None] = mapped_column(String, nullable=True)

    # Calculados pelo parser
    cost_pct: Mapped[float] = mapped_column(Float, default=0.0)       # % do custo total
    cumulative_pct: Mapped[float] = mapped_column(Float, default=0.0) # % acumulado
    abc_class: Mapped[str] = mapped_column(String, default="C")        # A | B | C
    item_type: Mapped[str] = mapped_column(String, default="A")        # A | B | C | D | E | F
    item_order: Mapped[int] = mapped_column(Integer, default=0)        # posição original

    # Status de mapeamento EPD
    mapping_status: Mapped[str] = mapped_column(String, default="pending")
    # auto | manual | pending | blocked | excluded

    # Decomposição (Tipo C) — sub-itens vinculados ao item pai
    parent_item_id: Mapped[str | None] = mapped_column(String, ForeignKey("abc_items.id"), nullable=True)

    # Notas do parser
    classification_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    abc_curve: Mapped["AbcCurve"] = relationship("AbcCurve", back_populates="items")
    sub_items: Mapped[list["AbcItem"]] = relationship("AbcItem", back_populates="parent_item", cascade="all, delete-orphan")
    parent_item: Mapped["AbcItem | None"] = relationship("AbcItem", back_populates="sub_items", remote_side=[id])
