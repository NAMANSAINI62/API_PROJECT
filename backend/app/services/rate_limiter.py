import math
import time
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError

logger = logging.getLogger(__name__)


@dataclass
class RateLimitResult:
    """Result of a rate-limit check for a single API key request."""
    is_limited: bool
    current_count: int
    limit: int
    ttl_remaining: int  # seconds until a token is available again


class RateLimitService:
    """
    Token Bucket rate limiter backed by PostgreSQL.

    How it works:
    - Each API key gets one row in the 'rate_limit_buckets' table.
    - The row stores how many tokens are left and when it was last refilled.
    - On every request:
        1. Lock the row with SELECT FOR UPDATE (prevents race conditions).
        2. Calculate how many tokens to add since the last refill.
        3. If there is at least 1 token, consume it and allow the request.
        4. If there are no tokens, block the request (HTTP 429).
        5. Save the updated token count back to the database.
    """

    @staticmethod
    def check(api_key_id: str, limit_per_minute: int, db: Session) -> RateLimitResult:
        # Import here to avoid circular imports at module level
        from app.models.all_models import RateLimitBucket

        capacity = float(limit_per_minute)
        # Tokens added per second (e.g. 60/min → 1.0 token/sec)
        refill_rate = limit_per_minute / 60.0
        now = datetime.now(timezone.utc)

        try:
            # Lock this api_key's row so no other request can touch it at the same time
            bucket = (
                db.query(RateLimitBucket)
                .filter(RateLimitBucket.api_key_id == api_key_id)
                .with_for_update()   # SELECT FOR UPDATE — row-level lock
                .first()
            )

            if bucket is None:
                # First request for this key — create a full bucket and consume 1 token
                bucket = RateLimitBucket(
                    api_key_id=api_key_id,
                    tokens=capacity - 1.0,       # Start full, consume 1 immediately
                    last_refilled_at=now,
                )
                db.add(bucket)
                db.commit()

                return RateLimitResult(
                    is_limited=False,
                    current_count=1,
                    limit=limit_per_minute,
                    ttl_remaining=0,
                )

            # Calculate how many tokens to add based on time passed since last refill
            last_refilled = bucket.last_refilled_at
            if last_refilled.tzinfo is None:
                # Make naive datetime timezone-aware so subtraction works
                last_refilled = last_refilled.replace(tzinfo=timezone.utc)

            time_passed = (now - last_refilled).total_seconds()
            time_passed = max(0.0, time_passed)

            # Add tokens but never exceed the bucket capacity
            new_tokens = time_passed * refill_rate
            available = min(capacity, bucket.tokens + new_tokens)

            if available >= 1.0:
                # Enough tokens — allow the request
                available -= 1.0
                is_limited = False
                used = int(capacity - available)
                # Time until one more token arrives
                ttl_remaining = 0
            else:
                # Not enough tokens — block the request
                is_limited = True
                used = limit_per_minute
                # Seconds until 1 token refills
                ttl_remaining = max(1, math.ceil((1.0 - available) / refill_rate)) if refill_rate > 0 else 60

            # Save updated state back to database
            bucket.tokens = available
            bucket.last_refilled_at = now
            db.commit()

            return RateLimitResult(
                is_limited=is_limited,
                current_count=used,
                limit=limit_per_minute,
                ttl_remaining=ttl_remaining,
            )

        except OperationalError:
            db.rollback()
            logger.error("Rate limit DB error — failing open (request allowed)")
            # If DB is down we fail open: allow the request rather than block everyone
            return RateLimitResult(
                is_limited=False,
                current_count=0,
                limit=limit_per_minute,
                ttl_remaining=0,
            )
        except Exception as e:
            db.rollback()
            logger.error(f"Unexpected rate limit error: {e}")
            return RateLimitResult(
                is_limited=False,
                current_count=0,
                limit=limit_per_minute,
                ttl_remaining=0,
            )
