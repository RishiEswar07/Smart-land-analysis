"""
db/base_class.py
-----------------
Defines the declarative Base that every ORM model inherits from,
plus a small mixin with fields common to (almost) every table
(id, created_at, updated_at).
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""
    pass


class TimestampMixin:
    """
    Mixin that adds created_at / updated_at columns, automatically
    managed by the database server (no need to set them manually).
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class UUIDPrimaryKeyMixin:
    """
    Mixin that gives a table a UUID primary key instead of a
    sequential integer. Used for user-facing / externally
    referenced entities (e.g. Land) where non-guessable IDs matter.
    """

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        unique=True,
        nullable=False,
        index=True,
    )
