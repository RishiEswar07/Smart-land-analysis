import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "Smart Land Analysis Platform"
    APP_ENV: str = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"
    
    DATABASE_URL: str
    DATABASE_URL_SYNC: str | None = None
    
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    BACKEND_CORS_ORIGINS: str = "*"
    REPORTS_DIR: str = "generated_reportsdir"

    def get_database_url(self, async_driver: bool = True) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        
        if async_driver:
            if "postgresql+asyncpg://" not in url:
                url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
            # Remove sslmode query param for asyncpg to prevent driver crashes
            if "?sslmode=" in url:
                url = url.split("?sslmode=")[0]
            elif "&sslmode=" in url:
                base, query = url.split("?")
                params = [p for p in query.split("&") if not p.startswith("sslmode=")]
                url = f"{base}?{'&'.join(params)}" if params else base
        else:
            if "postgresql+psycopg2://" not in url:
                url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
        return url

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
