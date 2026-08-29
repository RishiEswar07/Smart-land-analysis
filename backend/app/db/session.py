"""
db/session.py
-------------
Sets up the async SQLAlchemy engine and session factory used
throughout the application, plus the FastAPI dependency
`get_db` that yields a request-scoped AsyncSession.
"""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

# ------------------------------------------------------------------
# Async engine
#   - pool_pre_ping: validates connections before use (avoids stale
#     connections after DB restarts / idle timeouts)
#   - echo: SQL logging, tied to DEBUG so it's silent in production
# ------------------------------------------------------------------
engine: AsyncEngine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    future=True,
)

# ------------------------------------------------------------------
# Session factory
#   - expire_on_commit=False: keeps ORM objects usable after commit,
#     which matters because FastAPI serializes the response *after*
#     the request handler (and its commit) has finished.
# ------------------------------------------------------------------
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields a database session for the
    lifetime of a single request, and guarantees it is closed
    (and rolled back on error) afterwards.

    Usage:
        @router.get("/lands")
        async def list_lands(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
