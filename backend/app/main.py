"""
main.py
-------
FastAPI application entrypoint.

This file is intentionally minimal for now (Module 1: structure +
DB config only). Routers for Auth, Land, Facilities, Flood Risk,
AI Suitability, Dashboard and Reports will be `include_router()`-ed
here as each module is implemented.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.
    Runs once on startup and once on shutdown - used for things like
    verifying DB connectivity, warming caches, closing connection
    pools, etc.
    """
    logger.info("Starting %s [%s environment]", settings.APP_NAME, settings.APP_ENV)

    # Verify database connectivity at startup (fails fast if misconfigured)
    from app.db.session import engine
    from sqlalchemy import text

    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    logger.info("Database connection verified.")

    yield

    logger.info("Shutting down %s", settings.APP_NAME)
    await engine.dispose()


def create_application() -> FastAPI:
    """Application factory - builds and configures the FastAPI instance."""

    app = FastAPI(
        title=settings.APP_NAME,
        description="AI-Based Decision Support System for Building Planning - Backend API",
        version="1.0.0",
        openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
        docs_url=f"{settings.API_V1_PREFIX}/docs",
        redoc_url=f"{settings.API_V1_PREFIX}/redoc",
        lifespan=lifespan,
    )

    # ---------------- CORS ----------------
    # Allows the React (Vite) frontend to call this API from a
    # different origin during development and production.
    default_dev_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ]
    allow_origins = (
        settings.BACKEND_CORS_ORIGINS
        if settings.BACKEND_CORS_ORIGINS
        else (default_dev_origins if settings.APP_ENV == "development" else [])
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?" if settings.APP_ENV == "development" else None,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        # Content-Disposition isn't a CORS-safelisted response header by
        # default — without this, the frontend's blob-download code
        # (reportService.downloadReport) can't read the suggested PDF
        # filename cross-origin (dev: :5173 -> :8000).
        expose_headers=["Content-Disposition"],
    )

    # ---------------- Routers ----------------
    # Each module below is registered here as it is implemented.
    from app.routers import auth  # Auth module
    from app.routers import land  # Module 2
    from app.routers import analysis  # Module 6
    from app.routers import dashboard  # Dashboard module
    from app.routers import reports  # Reports module

    app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
    app.include_router(land.router, prefix=settings.API_V1_PREFIX)
    app.include_router(analysis.router, prefix=settings.API_V1_PREFIX)
    app.include_router(dashboard.router, prefix=settings.API_V1_PREFIX)
    app.include_router(reports.router, prefix=settings.API_V1_PREFIX)

    # Still to be added in later modules:
    #
    # from app.routers import facilities, flood_risk
    # app.include_router(facilities.router, prefix=settings.API_V1_PREFIX)
    # app.include_router(flood_risk.router, prefix=settings.API_V1_PREFIX)

    @app.get("/", tags=["Health"])
    async def root():
        """Basic liveness check."""
        return {
            "app": settings.APP_NAME,
            "status": "running",
            "environment": settings.APP_ENV,
        }

    @app.get(f"{settings.API_V1_PREFIX}/health", tags=["Health"])
    async def health_check():
        """Health check endpoint - verifies the API process is alive."""
        return {"status": "ok"}

    return app


app = create_application()
