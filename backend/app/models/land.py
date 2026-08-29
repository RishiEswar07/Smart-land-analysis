"""
models/land.py
---------------
SQLAlchemy ORM model for the `lands` table.

Reuses UUIDPrimaryKeyMixin and TimestampMixin from db/base_class.py
(Module 1) so id/created_at/updated_at stay consistent across every
table in the project.
"""

import enum
import uuid

from sqlalchemy import Boolean, Enum as SAEnum
from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base, TimestampMixin, UUIDPrimaryKeyMixin


class SoilType(str, enum.Enum):
    """Allowed soil type values — constrained at both DB and API level."""

    CLAYEY = "Clayey"
    SANDY = "Sandy"
    LOAMY = "Loamy"
    ROCKY = "Rocky"
    BLACK_COTTON = "Black Cotton"
    RED_SOIL = "Red Soil"


class LandType(str, enum.Enum):
    """Allowed land-use type values — constrained at both DB and API level."""

    RESIDENTIAL = "Residential"
    COMMERCIAL = "Commercial"
    INDUSTRIAL = "Industrial"
    AGRICULTURAL = "Agricultural"


class Land(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    A single land/plot record entered by a user for analysis.

    Note: id, created_at, updated_at come from the shared mixins
    (UUIDPrimaryKeyMixin, TimestampMixin) defined in Module 1's
    db/base_class.py — not redefined here.
    """

    __tablename__ = "lands"

    # Nullable so pre-existing rows (created before Auth existed) don't
    # break — but every land created going forward has this set by the
    # protected /lands POST endpoint from the logged-in user's token.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    land_name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)

    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)

    address: Mapped[str] = mapped_column(String(255), nullable=False)

    area_sqft: Mapped[float | None] = mapped_column(Float, nullable=True)
    road_width: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Full drawn polygon boundary, stored as a standard GeoJSON Polygon
    # geometry: {"type": "Polygon", "coordinates": [[[lng, lat], ...]]}.
    # Nullable so older rows (created via marker-only selection, before
    # polygon drawing existed) remain valid. latitude/longitude above
    # stay as the quick-access representative point (the polygon's
    # centroid); this column is the full shape for map redraws/PDF use.
    boundary_geojson: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    soil_type: Mapped[SoilType | None] = mapped_column(
        SAEnum(SoilType, name="soil_type_enum", native_enum=True),
        nullable=True,
    )
    land_type: Mapped[LandType] = mapped_column(
        SAEnum(LandType, name="land_type_enum", native_enum=True),
        nullable=False,
    )

    # Added: required by the AI suitability engine (infrastructure scoring)
    # and by the frontend's land-details form.
    water_availability: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
    electricity_availability: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid only
        return f"<Land id={self.id} name={self.land_name!r} type={self.land_type}>"
