import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Float, Integer, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class FactorRule(Base):
    """Regra salva pelo usuário para reutilização em futuros imports/auto-maps.

    Quando um analista confirma um fator de emissão para um item pendente/bloqueado
    e marca 'Salvar como regra', o sistema cria uma FactorRule. No próximo auto-map,
    itens com descrição similar são mapeados automaticamente usando essa regra.
    """
    __tablename__ = "factor_rules"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    company_id: Mapped[str] = mapped_column(
        String, ForeignKey("companies.id"), nullable=False, index=True
    )

    # Keywords para matching — texto normalizado (lowercase, sem acentos)
    match_keyword: Mapped[str] = mapped_column(String, nullable=False, index=True)
    # Descrição original do item que gerou a regra
    original_description: Mapped[str] = mapped_column(String, nullable=False)

    # Fator de emissão
    factor_value: Mapped[float] = mapped_column(Float, nullable=False)
    factor_unit: Mapped[str] = mapped_column(String, nullable=False)
    factor_name: Mapped[str] = mapped_column(String, nullable=False)
    source_tier: Mapped[str] = mapped_column(String, nullable=False)
    # 'ecoinvent' | 'ghg_protocol' | 'cecarbon' | 'user_custom'
    source_description: Mapped[str | None] = mapped_column(String, nullable=True)

    # IDs externos (para rastreabilidade)
    ecoinvent_product_id: Mapped[str | None] = mapped_column(String, nullable=True)
    ghg_factor_id: Mapped[int | None] = mapped_column(nullable=True)
    cecarbon_id: Mapped[int | None] = mapped_column(nullable=True)

    # Estatísticas de uso
    times_applied: Mapped[int] = mapped_column(Integer, default=0)
    times_overridden: Mapped[int] = mapped_column(Integer, default=0)

    # Quem criou
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
