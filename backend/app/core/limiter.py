from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.config import settings

def get_rate_limit_key(request):
    """
    Extract key identifier for SlowAPI rate limiting.
    Checks X-API-Key header first, then Authorization header, and falls back to client IP address.
    """
    x_api_key = request.headers.get("X-API-Key")
    if x_api_key and x_api_key.strip():
        return x_api_key.strip()
    
    authorization = request.headers.get("Authorization")
    if authorization and authorization.strip():
        raw = authorization.strip()
        if raw.lower().startswith("bearer "):
            return raw[7:].strip()
        return raw

    return get_remote_address(request)

# Initialize SlowAPI Limiter backed by Redis (or in-memory if Redis URL is invalid)
limiter = Limiter(
    key_func=get_rate_limit_key,
    storage_uri=settings.REDIS_URL,
    swallow_errors=True  # Fail-open resilience: allow requests if Redis is temporarily down
)
