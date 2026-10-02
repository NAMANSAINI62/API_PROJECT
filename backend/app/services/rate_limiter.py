import json
import time
import logging
from dataclasses import dataclass
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

# Atomic Lua script: increments counter and sets TTL in one round-trip.
# Returns [current_count, ttl_remaining].
# If the key is new (TTL == -1 after INCR), sets expiry to the window size.
RATE_LIMIT_LUA = """
local key = KEYS[1]
local window = tonumber(ARGV[1])
local count = redis.call('INCR', key)
local ttl = redis.call('TTL', key)
if ttl == -1 then
    redis.call('EXPIRE', key, window)
    ttl = window
end
return {count, ttl}
"""


@dataclass
class RateLimitResult:
    """Result of a rate-limit check for a single API key request."""
    is_limited: bool
    current_count: int
    limit: int
    ttl_remaining: int  # seconds until window resets


# In-memory fallback for when Redis is unavailable
_fallback_cache = {}

class RateLimitService:
    """
    Fixed-window rate limiter using Redis, isolated per API key.
    Redis key format: ratelimit:{api_key_id}:{window_start}
    """

    WINDOW_SECONDS = 60

    @staticmethod
    def _fallback_check(api_key_id: str, limit_per_minute: int) -> RateLimitResult:
        """In-memory rate limiting fallback for local dev when Redis is down."""
        current_window = int(time.time() // RateLimitService.WINDOW_SECONDS)
        redis_key = f"ratelimit:{api_key_id}:{current_window}"
        
        # Cleanup old windows (simple garbage collection)
        now = time.time()
        keys_to_delete = []
        for k, v in _fallback_cache.items():
            if now > v['expires_at']:
                keys_to_delete.append(k)
        for k in keys_to_delete:
            del _fallback_cache[k]

        if redis_key not in _fallback_cache:
            _fallback_cache[redis_key] = {
                'count': 0,
                'expires_at': time.time() + RateLimitService.WINDOW_SECONDS
            }
        
        _fallback_cache[redis_key]['count'] += 1
        current_count = _fallback_cache[redis_key]['count']
        ttl = max(0, int(_fallback_cache[redis_key]['expires_at'] - time.time()))
        
        return RateLimitResult(
            is_limited=current_count > limit_per_minute,
            current_count=current_count,
            limit=limit_per_minute,
            ttl_remaining=ttl,
        )

    @staticmethod
    def check(api_key_id: str, limit_per_minute: int) -> RateLimitResult:
        """
        Atomically increments the request counter for this API key's current
        minute window and checks against the configured limit.
        """
        r = get_redis()
        if not r:
            logger.warning("Redis unavailable — using in-memory rate limiting fallback")
            return RateLimitService._fallback_check(api_key_id, limit_per_minute)

        try:
            current_window = int(time.time() // RateLimitService.WINDOW_SECONDS)
            redis_key = f"ratelimit:{api_key_id}:{current_window}"

            result = r.eval(RATE_LIMIT_LUA, 1, redis_key, RateLimitService.WINDOW_SECONDS)
            current_count = int(result[0])
            ttl_remaining = max(int(result[1]), 0)

            return RateLimitResult(
                is_limited=current_count > limit_per_minute,
                current_count=current_count,
                limit=limit_per_minute,
                ttl_remaining=ttl_remaining,
            )
        except Exception as e:
            logger.error(f"Redis rate limiting error: {e}")
            return RateLimitService._fallback_check(api_key_id, limit_per_minute)


class CacheService:
    """
    Small Redis caching utility for project configurations.
    """

    @staticmethod
    def get_project_cache(project_id: str) -> dict | None:
        r = get_redis()
        if not r:
            return None
        try:
            data = r.get(f"project_config:{project_id}")
            if data:
                return json.loads(data)
        except Exception as e:
            logger.error(f"Cache get error: {e}")
        return None

    @staticmethod
    def set_project_cache(project_id: str, config: dict, ttl: int = 300):
        r = get_redis()
        if not r:
            return
        try:
            r.setex(f"project_config:{project_id}", ttl, json.dumps(config))
        except Exception as e:
            logger.error(f"Cache set error: {e}")

    @staticmethod
    def delete_project_cache(project_id: str):
        r = get_redis()
        if not r:
            return
        try:
            r.delete(f"project_config:{project_id}")
        except Exception as e:
            logger.error(f"Cache delete error: {e}")
