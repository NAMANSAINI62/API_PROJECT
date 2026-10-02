import redis
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

try:
    redis_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
except Exception as e:
    logger.warning(f"Failed to connect to Redis initially: {e}")
    redis_client = None

def get_redis():
    return redis_client
