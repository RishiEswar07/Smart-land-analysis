"""
dependencies/auth.py
---------------------
`get_current_user` — the FastAPI dependency that protects a route.

Usage:
    @router.post("/lands")
    async def create_land(payload: LandCreate, current_user: User = Depends(get_current_user)):
        ...

Reads the `Authorization: Bearer <token>` header (this is exactly what
src/services/api.js sends on every request once a token is stored),
verifies the JWT, and loads the corresponding User row. Raises 401 if
the header is missing, the token is invalid/expired, or the user no
longer exists/is inactive.
"""

import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User
from app.services.auth_service import get_user_by_id

# auto_error=False so a missing header produces our own clean 401
# response/detail instead of FastAPI's generic one.
_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated. Please log in.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None:
        raise unauthorized

    payload = decode_access_token(credentials.credentials)
    if payload is None or payload.get("type") != "access":
        raise unauthorized

    user_id_raw = payload.get("sub")
    if user_id_raw is None:
        raise unauthorized

    try:
        user_id = uuid.UUID(user_id_raw)
    except (ValueError, TypeError):
        raise unauthorized

    user = await get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise unauthorized

    return user
