from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.core.config import settings
from app.db.session import engine
import logging

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Resilient connection check on startup for cold-start protection
    try:
        async with engine.connect() as conn:
            logger.info("Database connection established successfully.")
    except Exception as e:
        logger.warning(f"Initial database connection warning (cold start or wakeup phase): {e}")
    yield
    await engine.dispose()

app = FastAPI(
    title=settings.APP_NAME,
    debug=settings.DEBUG,
    lifespan=lifespan
)
