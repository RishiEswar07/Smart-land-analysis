"""
models/report.py
-----------------
SQLAlchemy ORM model for the `reports` table — metadata for a
generated PDF report. The actual PDF file lives on disk under
settings.REPORTS_DIR; this row just tracks where it is.
"""

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Report(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """One generated PDF report for one Analysis."""

    __tablename__ = "reports"

    analysis_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("analyses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    land_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lands.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Report id={self.id} analysis_id={self.analysis_id}>"
