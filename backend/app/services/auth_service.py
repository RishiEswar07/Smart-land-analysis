"""
services/auth_service.py
-------------------------
Business logic for registration and login.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.user import User
from app.schemas.auth import RegisterRequest


class EmailAlreadyRegisteredError(Exception):
    """Raised when registering with an email that's already in use."""


class InvalidCredentialsError(Exception):
    """Raised when login email/password don't match a known, active user."""


async def register_user(db: AsyncSession, payload: RegisterRequest) -> User:
    """Creates a new user with a securely hashed password. Raises EmailAlreadyRegisteredError on duplicate email."""
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise EmailAlreadyRegisteredError(payload.email)

    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User:
    """Verifies credentials and returns the User. Raises InvalidCredentialsError if they don't match."""
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active or not verify_password(password, user.password_hash):
        # Deliberately identical error for "no such user" and "wrong password"
        # so the API doesn't leak which emails are registered.
        raise InvalidCredentialsError()

    return user


async def get_user_by_id(db: AsyncSession, user_id) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()
