"""
services/land_service.py
-------------------------
Business logic layer for Land Management (Module 2).

Routers call these functions instead of touching SQLAlchemy directly —
keeps the router layer thin (HTTP only) and makes this logic reusable
by other modules later (e.g. AI Suitability service will call
`get_land` to pull a land's attributes for inference).
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.land import Land
from app.schemas.land import LandCreate, LandUpdate
from app.services.exceptions import NotFoundError


async def create_land(db: AsyncSession, payload: LandCreate, user_id: uuid.UUID | None = None) -> Land:
    """Creates and persists a new Land record, owned by the given user (if provided)."""
    land = Land(**payload.model_dump(), user_id=user_id)
    db.add(land)
    await db.commit()
    await db.refresh(land)
    return land


async def get_land(db: AsyncSession, land_id: uuid.UUID, user_id: uuid.UUID | None = None) -> Land:
    """
    Fetches a single Land by id, optionally enforcing user ownership.
    Raises NotFoundError if no matching row exists or if not owned by the user.
    """
    stmt = select(Land).where(Land.id == land_id)
    if user_id is not None:
        stmt = stmt.where(Land.user_id == user_id)
    result = await db.execute(stmt)
    land = result.scalar_one_or_none()
    if land is None:
        raise NotFoundError(entity="Land", identifier=str(land_id))
    return land


async def list_lands(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 20,
    user_id: uuid.UUID | None = None,
) -> tuple[list[Land], int]:
    """
    Returns a page of Land records plus the total matching count
    (used to build the paginated LandListResponse). When `user_id` is
    given, only that user's lands are returned — this is what scopes
    "My Lands" / the Dashboard to the logged-in user.
    """
    base_query = select(Land)
    count_query = select(func.count()).select_from(Land)
    if user_id is not None:
        base_query = base_query.where(Land.user_id == user_id)
        count_query = count_query.where(Land.user_id == user_id)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    result = await db.execute(
        base_query.order_by(Land.created_at.desc()).offset(skip).limit(limit)
    )
    lands = list(result.scalars().all())

    return lands, total


async def update_land(
    db: AsyncSession, land_id: uuid.UUID, payload: LandUpdate, user_id: uuid.UUID | None = None
) -> Land:
    """
    Partially updates a Land record — only fields explicitly set in
    the request body are applied (`exclude_unset=True`).
    Enforces user ownership if user_id is supplied.
    Raises NotFoundError if the land doesn't exist or is not owned by user.
    """
    land = await get_land(db, land_id, user_id=user_id)

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(land, field, value)

    await db.commit()
    await db.refresh(land)
    return land


async def delete_land(db: AsyncSession, land_id: uuid.UUID, user_id: uuid.UUID | None = None) -> None:
    """
    Deletes a Land record. Enforces user ownership if user_id is supplied.
    Raises NotFoundError if the land doesn't exist or is not owned by user.
    """
    land = await get_land(db, land_id, user_id=user_id)
    await db.delete(land)
    await db.commit()
