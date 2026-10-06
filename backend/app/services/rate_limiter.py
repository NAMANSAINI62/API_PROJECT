import json
import time
import math
import logging
from dataclasses import dataclass
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

RATE_LIMIT_LUA = """

local key = KEYS[1]
local max_tokens = tonumber(ARGV[1])      
local tokens_per_sec = tonumber(ARGV[2])  
local tokens_requested = 1                
local redis_time = redis.call('TIME')
local current_time = tonumber(redis_time[1]) + (tonumber(redis_time[2]) / 1000000)
local bucket = redis.call('HMGET', key, 'tokens', 'last_refreshed')
local available_tokens = tonumber(bucket[1])
local last_refreshed = tonumber(bucket[2])

if available_tokens == nil then
    available_tokens = max_tokens
    last_refreshed = current_time
end

-- 4. Calculate how many new tokens to add based on time passed
local time_passed = math.max(0, current_time - last_refreshed)
local new_tokens_to_add = time_passed * tokens_per_sec

-- Add new tokens, but cap it at 'max_tokens' (bucket can't overflow)
available_tokens = math.min(max_tokens, available_tokens + new_tokens_to_add)

-- 5. Check if we have enough tokens to allow this request
local is_rate_limited = 1  -- Default to 1 (True = Rejected)

if available_tokens >= tokens_requested then
    -- We have enough tokens! Consume them and allow the request.
    available_tokens = available_tokens - tokens_requested
    is_rate_limited = 0    -- Set to 0 (False = Accepted)
end

-- 6. Save the updated bucket state back to Redis
redis.call('HMSET', key, 'tokens', available_tokens, 'last_refreshed', current_time)

-- 7. Set an expiration (TTL) to automatically clean up inactive keys
-- TTL = time to completely refill the bucket + 60 seconds buffer
local ttl = 60
if tokens_per_sec > 0 then
    ttl = math.ceil(max_tokens / tokens_per_sec) + 60
end
redis.call('EXPIRE', key, ttl)

-- 8. Return results back to Python
-- We use math.floor to avoid returning floating point numbers to Python
return {is_rate_limited, math.floor(available_tokens)}
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

    @staticmethod
    def _fallback_check(api_key_id: str, limit_per_minute: int) -> RateLimitResult:
        """In-memory token bucket fallback for local dev when Redis is down."""
        now = time.time()
        redis_key = f"tokenbucket:{api_key_id}"
        capacity = limit_per_minute
        refill_rate = limit_per_minute / 60.0

        # Cleanup old buckets to avoid memory leaks
        keys_to_delete = []
        for k, v in _fallback_cache.items():
            ttl = math.ceil(capacity / refill_rate) + 60 if refill_rate > 0 else 60
            if now - v['last_refreshed'] > ttl:
                keys_to_delete.append(k)
        for k in keys_to_delete:
            del _fallback_cache[k]

        if redis_key not in _fallback_cache:
            _fallback_cache[redis_key] = {
                'tokens': capacity,
                'last_refreshed': now
            }
        
        bucket = _fallback_cache[redis_key]
        time_passed = max(0, now - bucket['last_refreshed'])
        new_tokens = time_passed * refill_rate
        
        bucket['tokens'] = min(capacity, bucket['tokens'] + new_tokens)
        
        is_limited = True
        if bucket['tokens'] >= 1:
            bucket['tokens'] -= 1
            is_limited = False
            
        bucket['last_refreshed'] = now

        if is_limited:
            ttl_remaining = max(1, int(1.0 / refill_rate)) if refill_rate > 0 else 60
        else:
            ttl_remaining = max(0, int((capacity - bucket['tokens']) / refill_rate)) if refill_rate > 0 else 0

        return RateLimitResult(
            is_limited=is_limited,
            current_count=capacity - int(bucket['tokens']),
            limit=limit_per_minute,
            ttl_remaining=ttl_remaining,
        )

    @staticmethod
    def check(api_key_id: str, limit_per_minute: int) -> RateLimitResult:
        r = get_redis()
        if not r:
            logger.warning("Redis unavailable — using in-memory rate limiting fallback")
            return RateLimitService._fallback_check(api_key_id, limit_per_minute)

        try:
            # We change the key prefix to tokenbucket to avoid conflicts with old fixed-window keys
            redis_key = f"ratelimit:tokenbucket:{api_key_id}"
            capacity = limit_per_minute
            refill_rate = limit_per_minute / 60.0  # Tokens replenished per second

            result = r.eval(RATE_LIMIT_LUA, 1, redis_key, capacity, refill_rate)
            is_limited = bool(result[0])
            tokens_remaining = int(result[1])

            # Calculate TTL for informative headers
            if is_limited:
                ttl_remaining = max(1, int(1.0 / refill_rate)) if refill_rate > 0 else 60
            else:
                ttl_remaining = max(0, int((capacity - tokens_remaining) / refill_rate)) if refill_rate > 0 else 0

            return RateLimitResult(
                is_limited=is_limited,
                current_count=capacity - tokens_remaining,  # Approximate used count for compatibility
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
