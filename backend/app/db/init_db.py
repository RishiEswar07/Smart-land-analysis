"""
db/init_db.py
-------------
Convenience helper for local development / testing to create all
tables directly from the ORM metadata, without running Alembic.

In production, DO NOT use create_all(). Use Alembic migrations
instead (see alembic/ directory) so schema changes are tracked
and reversible.
"""

import logging

from app.db.base import Base          # imports Base + all models
from app.db.session import engine

logger = logging.getLogger(__name__)


async def create_all_tables() -> None:
    """
    Creates all tables defined on Base.metadata.
    Intended for local development bootstrapping only.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created (create_all).")


async def drop_all_tables() -> None:
    """
    Drops all tables defined on Base.metadata.
    DANGEROUS - intended for local development / test teardown only.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    logger.warning("Database tables dropped (drop_all).")
