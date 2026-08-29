"""
models/analysis.py
-------------------
SQLAlchemy ORM model for the `analyses` table — stores the result of
running the suitability engine against a Land record.

NOTE ON THE SCORING ENGINE: the fields below are computed today by a
deterministic, rule-based engine (services/analysis_service.py) — not
yet a trained ML model. This table's shape is exactly what a trained
Random Forest / XGBoost pipeline will populate later, so swapping the
engine will NOT require any change to this model, the API response
schema, or the frontend.

risk_score / risk_level / risk_breakdown are the dedicated Risk
Analysis fields (added to fix the "always ~75%" bug — see
services/analysis_service.py for the full formula and weights).
"""

import uuid

from sqlalchemy import Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Analysis(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """One AI suitability + risk result for one Land."""

    __tablename__ = "analyses"

    land_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lands.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    suitability_score: Mapped[float] = mapped_column(Float, nullable=False)
    recommended_building_type: Mapped[str] = mapped_column(String(50), nullable=False)

    flood_risk: Mapped[str] = mapped_column(String(20), nullable=False)
    environmental_risk: Mapped[str] = mapped_column(String(20), nullable=False)

    infrastructure_score: Mapped[float] = mapped_column(Float, nullable=False)
    traffic_accessibility_score: Mapped[float] = mapped_column(Float, nullable=False)

    # ---- Dedicated Risk Analysis fields ----
    # risk_score: 0-100, HIGHER = MORE RISK (opposite polarity from the
    # scores above, which are "higher = better"). risk_level is the
    # banded label derived from risk_score (Low/Moderate/High).
    risk_score: Mapped[float] = mapped_column(Float, nullable=False)
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False)
    # Per-factor breakdown (each 0-100, higher = more risk) stored as
    # JSON so the frontend can render an explainable list without a
    # schema migration every time a factor is added/renamed.
    risk_breakdown: Mapped[dict] = mapped_column(JSONB, nullable=False)

    ai_explanation: Mapped[str] = mapped_column(Text, nullable=False)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Analysis id={self.id} land_id={self.land_id} risk_score={self.risk_score}>"
