"""
models/user.py
---------------
SQLAlchemy ORM model for the `users` table.
"""

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base, TimestampMixin, UUIDPrimaryKeyMixin


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """A registered platform user."""

    __tablename__ = "users"

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # Single role field, kept simple on purpose — no RBAC logic is built
    # on top of it yet. Present for future extension (admin dashboards,
    # civil-engineer-only endpoints, etc.) without another migration.
    role: Mapped[str] = mapped_column(String(30), nullable=False, default="user")

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<User id={self.id} email={self.email!r}>"
