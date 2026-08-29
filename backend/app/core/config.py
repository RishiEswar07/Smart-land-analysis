"""
core/config.py
---------------
Centralized application configuration.

All environment-driven settings live here so the rest of the codebase
never touches `os.environ` directly. Values are loaded from a `.env`
file (see .env.example) via pydantic-settings, validated, and cached
as a singleton using `lru_cache` so the file is parsed only once.
"""

from functools import lru_cache
from typing import List

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Strongly typed application settings.

    Every attribute below maps 1:1 to an environment variable of the
    same name (case-insensitive). See `.env.example` for descriptions.
    """

    # ---------------- App ----------------
    APP_NAME: str = "Smart Land Analysis Platform"
    APP_ENV: str = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"

    # ---------------- Database ----------------
    DATABASE_URL: str          # asyncpg connection string (runtime)
    DATABASE_URL_SYNC: str     # psycopg2 connection string (Alembic only)

    # ---------------- JWT ----------------
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ---------------- CORS ----------------
    # Read as a plain string, not List[str]. pydantic-settings tries to
    # JSON-decode env values for "complex" types like List[str] BEFORE
    # any validator runs, which crashes on a plain comma-separated
    # string like "http://a.com,http://b.com" (no quotes/brackets).
    # Reading it as `str` sidesteps that entirely; BACKEND_CORS_ORIGINS
    # below exposes the parsed list to the rest of the app.
    BACKEND_CORS_ORIGINS_RAW: str = Field(default="", validation_alias="BACKEND_CORS_ORIGINS")

    # ---------------- Reports ----------------
    REPORTS_DIR: str = "generated_reports"

    @computed_field  # type: ignore[misc]
    @property
    def BACKEND_CORS_ORIGINS(self) -> List[str]:
        """Comma-separated env value, parsed into a clean list of origins."""
        return [origin.strip() for origin in self.BACKEND_CORS_ORIGINS_RAW.split(",") if origin.strip()]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """
    Returns a cached Settings instance.
    Using lru_cache ensures the .env file is read only once per process,
    and the same Settings object is reused (dependency-injection friendly).
    """
    return Settings()


# Convenient module-level singleton for places that don't use DI
settings = get_settings()
