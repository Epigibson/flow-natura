"""
Flow Natura Backend - Configuration
Loads environment variables and provides typed settings.
"""
import os
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database (Supabase PostgreSQL - direct connection)
    DATABASE_URL: str  # postgresql+asyncpg://user:pass@host:port/db

    # Supabase (JWT secret ya no se usa, se valida via JWKS automáticamente)
    SUPABASE_JWT_SECRET: str = ""
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str

    # App
    APP_NAME: str = "Flow Natura API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    CORS_ORIGINS: str = "http://localhost:4321,http://localhost:3000"

    # Gemini AI (optional, for product analysis)
    GEMINI_API_KEY: str = ""

    class Config:
        # Local dev: read from ../.env; Render: reads from system env vars
        env_file = "../.env" if os.path.exists("../.env") else None
        env_file_encoding = "utf-8"
        extra = "ignore"  # Ignore extra env vars from the shared .env


@lru_cache()
def get_settings() -> Settings:
    return Settings()

