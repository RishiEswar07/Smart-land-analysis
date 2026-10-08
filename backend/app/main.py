"""
main.py
-------
FastAPI application entrypoint.
Configures CORS, lifespan, documentation endpoints, and includes all routers.
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
    Runs once on startup and once on shutdown.
    Verifies DB connectivity without crashing the process if the database
    is waking up or temporarily spinning up (e.g. Supabase cold starts).
    Also ensures all required database tables exist.
    """
    import os
    import re

    logger.info("Starting %s [%s environment]", settings.APP_NAME, settings.APP_ENV)

    is_cloud = bool(os.environ.get("RENDER")) or settings.APP_ENV == "production"
    db_url = settings.DATABASE_URL

    if not db_url or "localhost" in db_url or "127.0.0.1" in db_url:
        if is_cloud:
            logger.error(
                "CRITICAL: DATABASE_URL is not configured on Render! "
                "Cloud containers cannot connect to localhost:5432. "
                "Please add DATABASE_URL in Render Dashboard -> Environment Variables."
            )

    # Sanitize DB URL for logging
    sanitized_url = re.sub(r":([^:@]+)@", ":****@", db_url) if db_url else "UNCONFIGURED"
    logger.info("Configured Database URL: %s", sanitized_url)

    # Verify database connectivity and initialize tables if needed
    try:
        from app.db.session import engine
        from app.db.base import Base
        from sqlalchemy import text

        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("Database connection verified successfully.")

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database schema verified / initialized.")
    except Exception as exc:
        sanitized_exc = re.sub(r":([^:@]+)@", ":****@", str(exc))
        logger.warning(
            "Database connection/initialization warning at startup: %s. "
            "If using cloud PostgreSQL, verify host, port, credentials, and SSL settings.",
            sanitized_exc,
        )

    yield

    logger.info("Shutting down %s", settings.APP_NAME)
    try:
        from app.db.session import engine
        await engine.dispose()
    except Exception as exc:
        logger.warning("Error closing database connection pool during shutdown: %s", exc)


def create_application() -> FastAPI:
    """Application factory - builds and configures the FastAPI instance."""

    openapi_tags = [
        {"name": "Health", "description": "Liveness and health check endpoints"},
        {"name": "Authentication", "description": "User registration, authentication, and JWT token management"},
        {"name": "Land Management", "description": "Create, retrieve, update, and manage land parcels"},
        {"name": "Land Cover (ESA WorldCover)", "description": "Real-time ESA WorldCover 10m satellite classification via COG streaming"},
        {"name": "AI Suitability Analysis", "description": "Machine learning feasibility engine, risk assessment, and explainable AI"},
        {"name": "Dashboard", "description": "Aggregated analytics, metrics, building distributions, and recent analyses"},
        {"name": "PDF Reports", "description": "Generate and download comprehensive land feasibility audit PDF reports"},
    ]

    app = FastAPI(
        title=settings.APP_NAME,
        description="AI-Based Decision Support System for Building Planning - Backend API",
        version="1.0.0",
        openapi_tags=openapi_tags,
        openapi_url="/openapi.json",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # ---------------- CORS ----------------
    # Allows Vercel production frontend and local dev environments
    default_origins = [
        "https://analysis.vercel.app",
        "https://smart-land-analysis.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ]
    configured_origins = list(settings.BACKEND_CORS_ORIGINS) if settings.BACKEND_CORS_ORIGINS else []
    
    # Merge configured origins with default origins
    for orig in default_origins:
        if orig not in configured_origins:
            configured_origins.append(orig)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=configured_origins if "*" not in configured_origins else ["*"],
        allow_origin_regex=r"https://.*\.vercel\.app|http://(localhost|127\.0\.0\.1)(:\d+)?" if "*" not in configured_origins else None,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition", "content-disposition"],
    )

    # ---------------- Global Exception Handler ----------------
    # Ensures that unhandled errors (e.g. database disconnect) still return proper CORS headers
    from fastapi import Request
    from fastapi.responses import JSONResponse

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error("Unhandled exception processing %s %s: %s", request.method, request.url, exc, exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "detail": f"Backend server or database error: {str(exc)}" if settings.DEBUG else "Database or backend error. Please check server logs and DATABASE_URL."
            },
        )

    # ---------------- Routers ----------------
    from app.routers import (
        analysis,
        auth,
        dashboard,
        land,
        landcover,
        reports,
    )

    # Include all API routers with the global API prefix (e.g. /api/v1)
    app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
    app.include_router(land.router, prefix=settings.API_V1_PREFIX)
    app.include_router(landcover.router, prefix=settings.API_V1_PREFIX)
    app.include_router(analysis.router, prefix=settings.API_V1_PREFIX)
    app.include_router(dashboard.router, prefix=settings.API_V1_PREFIX)
    app.include_router(reports.router, prefix=settings.API_V1_PREFIX)

    # ---------------- Documentation Redirects ----------------
    @app.get(f"{settings.API_V1_PREFIX}/docs", include_in_schema=False)
    async def api_v1_docs():
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/docs")

    @app.get(f"{settings.API_V1_PREFIX}/openapi.json", include_in_schema=False)
    async def api_v1_openapi():
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/openapi.json")

    # ---------------- Health / Root Endpoints ----------------
    @app.get("/", tags=["Health"], status_code=200)
    async def root():
        """Root health check endpoint."""
        return {
            "message": "Smart Land Analysis API is running"
        }

    @app.get("/health", tags=["Health"], status_code=200)
    @app.get(f"{settings.API_V1_PREFIX}/health", tags=["Health"], status_code=200)
    async def health_check():
        """Lightweight health check endpoint - verifies the API process is alive."""
        return {"status": "healthy"}

    @app.get(f"{settings.API_V1_PREFIX}/health/db", tags=["Health"])
    async def health_db_check():
        """Database connectivity health check endpoint."""
        import os
        import re

        is_cloud = bool(os.environ.get("RENDER")) or settings.APP_ENV == "production"
        db_url = settings.DATABASE_URL

        if is_cloud and (not db_url or "localhost" in db_url or "127.0.0.1" in db_url):
            return JSONResponse(
                status_code=503,
                content={
                    "status": "error",
                    "database": "unconfigured",
                    "detail": "DATABASE_URL is not configured in Render Environment Variables. Please add a valid cloud PostgreSQL connection string in Render Dashboard.",
                },
            )

        try:
            from app.db.session import engine
            from sqlalchemy import text
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return {
                "status": "ok",
                "database": "connected",
                "message": "Database connectivity verified successfully.",
            }
        except Exception as exc:
            sanitized_err = re.sub(r":([^:@]+)@", ":****@", str(exc))
            return JSONResponse(
                status_code=503,
                content={
                    "status": "error",
                    "database": "disconnected",
                    "detail": sanitized_err,
                },
            )

    return app


app = create_application()
