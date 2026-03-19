import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Float, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class ItemMapping(Base):
    __tablename__ = "item_mappings"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    abc_item_id: Mapped[str] = mapped_column(
        String, ForeignKey("abc_items.id"), nullable=False, index=True
    )

    # Referência ao fator usado (Ecoinvent ou GHG — armazena IDs do Supabase)
    source_tier: Mapped[str] = mapped_column(String, nullable=False)
    # 'ecoinvent' | 'ghg_protocol' | 'epd' | 'user_custom' | 'excluded'

    # IDs externos (Supabase) — dependem do source_tier
    ecoinvent_product_id: Mapped[str | None] = mapped_column(String, nullable=True)
    ecoinvent_activity_id: Mapped[str | None] = mapped_column(String, nullable=True)
    ghg_factor_id: Mapped[int | None] = mapped_column(nullable=True)
    epd_id: Mapped[int | None] = mapped_column(nullable=True)

    # Fator desnormalizado (valor efetivo usado no cálculo)
    factor_value: Mapped[float] = mapped_column(Float, nullable=False)
    factor_unit: Mapped[str] = mapped_column(String, nullable=False)  # 'kg CO2-Eq'
    product_unit: Mapped[str | None] = mapped_column(String, nullable=True)  # 'kg','m³','kWh'

    # Metadados do match
    factor_name: Mapped[str] = mapped_column(String, nullable=False)
    factor_source: Mapped[str | None] = mapped_column(String, nullable=True)
    confidence: Mapped[str | None] = mapped_column(String, nullable=True)
    # 'high' | 'medium' | 'low'
    similarity_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Quem mapeou
    mapped_by: Mapped[str] = mapped_column(String, default="auto")
    # 'auto' | user_id | 'user_custom' | 'excluded'

    # Campos para fator manual (user_custom)
    custom_factor_source: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Campos para exclusão
    exclusion_justification: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Scope 3 logística
    distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    transport_modal: Mapped[str | None] = mapped_column(String, nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    abc_item: Mapped["AbcItem"] = relationship("AbcItem", backref="mapping")
