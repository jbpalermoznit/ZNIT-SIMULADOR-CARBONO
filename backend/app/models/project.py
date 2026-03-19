import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String, ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    client_name: Mapped[str | None] = mapped_column(String, nullable=True)
    address: Mapped[str | None] = mapped_column(String, nullable=True)
    total_area_m2: Mapped[float | None] = mapped_column(Float, nullable=True)
    building_type: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="active")  # active | archived
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    company: Mapped["Company"] = relationship("Company", back_populates="projects")
    abc_curves: Mapped[list["AbcCurve"]] = relationship("AbcCurve", back_populates="project")
