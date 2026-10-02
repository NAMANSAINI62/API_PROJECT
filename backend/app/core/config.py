import os
from urllib.parse import quote

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "PulseGate"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # Database and Redis
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres@postgres:5432/pulsegate",
    )
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://redis:6379/0")

    # JWT authentication
    JWT_SECRET: str = os.getenv("JWT_SECRET", "")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

    # Environment URLs
    SERVER_BASE_URL: str = os.getenv("SERVER_BASE_URL", "http://localhost:8000")
    INTERNAL_BASE_URL: str = os.getenv("INTERNAL_BASE_URL", "http://localhost:8000")
    FRONTEND_URL: str = os.getenv(
        "FRONTEND_URL",
        "http://localhost:5173,http://127.0.0.1:5173",
    )

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

# Build service URLs from separate credentials so passwords containing URL
# characters such as "@", ":" or "/" remain valid connection credentials.
postgres_password = os.getenv("POSTGRES_PASSWORD")
postgres_host = os.getenv("POSTGRES_HOST")
if postgres_password and postgres_host:
    postgres_user = quote(os.getenv("POSTGRES_USER", "postgres"), safe="")
    postgres_database = os.getenv("POSTGRES_DB", "pulsegate")
    settings.DATABASE_URL = (
        f"postgresql://{postgres_user}:{quote(postgres_password, safe='')}"
        f"@{postgres_host}:5432/{postgres_database}"
    )

redis_password = os.getenv("REDIS_PASSWORD")
redis_host = os.getenv("REDIS_HOST")
if redis_password and redis_host:
    settings.REDIS_URL = (
        f"redis://:{quote(redis_password, safe='')}@{redis_host}:6379/0"
    )

if settings.ENVIRONMENT.lower() == "production":
    if not settings.JWT_SECRET or len(settings.JWT_SECRET) < 32:
        raise RuntimeError("JWT_SECRET must be a strong, externally managed secret in production")
    if not settings.SERVER_BASE_URL.startswith("https://"):
        raise RuntimeError("SERVER_BASE_URL must use HTTPS in production")
    frontend_origins = [origin.strip() for origin in settings.FRONTEND_URL.split(",") if origin.strip()]
    if not frontend_origins or any(not origin.startswith("https://") for origin in frontend_origins):
        raise RuntimeError("FRONTEND_URL must contain only HTTPS origins in production")
