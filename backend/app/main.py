from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import Base, engine

# Import models to ensure they are registered with SQLAlchemy Base
from app.models import all_models  # noqa

# Import routers
from app.api import auth, projects, api_keys, logs, usage, gateway
from starlette.middleware.base import BaseHTTPMiddleware

# Create tables automatically on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; frame-ancestors 'none'",
        )
        if settings.ENVIRONMENT.lower() == "production":
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        return response


app.add_middleware(SecurityHeadersMiddleware)

cors_origins = [origin.strip() for origin in settings.FRONTEND_URL.split(",") if origin.strip()]
if settings.ENVIRONMENT.lower() != "production":
    cors_origins.extend([
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ])

# Set CORS origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(cors_origins)),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["auth"])
app.include_router(projects.router, prefix=f"{settings.API_V1_STR}/projects", tags=["projects"])
app.include_router(api_keys.router, prefix=f"{settings.API_V1_STR}/keys", tags=["api_keys"])
app.include_router(logs.router, prefix=f"{settings.API_V1_STR}/logs", tags=["logs"])
app.include_router(usage.router, prefix=f"{settings.API_V1_STR}/usage", tags=["usage"])
app.include_router(gateway.router, prefix="", tags=["gateway"])
app.include_router(gateway.router, prefix=settings.API_V1_STR, tags=["gateway"])


@app.get("/")
def root():
    return {"message": "PulseGate API Gateway active", "version": settings.VERSION}


@app.get("/health")
def health_check():
    return {"status": "healthy"}
