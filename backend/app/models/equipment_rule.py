import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Float, Integer, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class EquipmentRule(Base):
    """Regra de emissão para equipamentos (Tipo E).

    Cadeia de conversão:
      quantidade (h) × consumo_por_hora (L/h ou kWh/h) × fator_emissão (kgCO₂/L ou kgCO₂/kWh) = kgCO₂e

    Cada categoria de equipamento (retroescavadeira, caminhão, etc.) tem sua própria regra.
    """
    __tablename__ = "equipment_rules"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    company_id: Mapped[str] = mapped_column(
        String, ForeignKey("companies.id"), nullable=False, index=True
    )

    # Matching — keyword normalizado da descrição do item
    match_keyword: Mapped[str] = mapped_column(String, nullable=False, index=True)
    original_description: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    # ex: 'retroescavadeira', 'caminhão basculante', 'máquina de solda', 'andaime'

    # Cadeia de conversão
    fuel_type: Mapped[str] = mapped_column(String, nullable=False)
    # 'diesel' | 'gasoline' | 'electric' | 'glp' | 'none' (ex: andaime)
    consumption_per_hour: Mapped[float] = mapped_column(Float, nullable=False)
    consumption_unit: Mapped[str] = mapped_column(String, nullable=False)
    # 'L/h' | 'kWh/h' | 'kg/h'

    # Fator de emissão do combustível
    emission_factor_value: Mapped[float] = mapped_column(Float, nullable=False)
    emission_factor_unit: Mapped[str] = mapped_column(String, nullable=False)
    # 'kgCO₂/L' | 'kgCO₂/kWh'
    emission_factor_source: Mapped[str] = mapped_column(String, nullable=False)
    # ex: 'GHG Protocol BR 2023', 'CECarbon 2024', 'BEN 2023'
    emission_factor_tier: Mapped[str] = mapped_column(String, nullable=False)
    # 'ghg_protocol' | 'cecarbon' | 'ecoinvent'

    # Scope — equipamentos geralmente são Scope 1 (combustão) ou Scope 2 (elétrico)
    scope: Mapped[int] = mapped_column(Integer, default=1)
    # 1 = combustão direta, 2 = energia elétrica

    # Notas
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Estatísticas
    times_applied: Mapped[int] = mapped_column(Integer, default=0)

    # Metadata
    created_by: Mapped[str] = mapped_column(String, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
