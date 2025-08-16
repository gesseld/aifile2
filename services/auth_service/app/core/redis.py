import json
import logging
from typing import Optional

import redis
from app.core.config import settings
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class RedisClient:
    def __init__(self):
        self._client = None

    async def connect(self):
        try:
            self._client = redis.Redis.from_url(
                settings.REDIS_URL, decode_responses=True
            )
            # Test connection
            self._client.ping()
            logger.info("Connected to Redis")
        except Exception as e:
            logger.error(f"Redis connection error: {str(e)}")
            raise

    async def close(self):
        if self._client:
            self._client.close()
            logger.info("Redis connection closed")

    async def publish_event(self, channel: str, event: BaseModel):
        if not self._client:
            await self.connect()

        try:
            payload = event.json()
            self._client.publish(channel, payload)
            logger.debug(f"Published event to {channel}: {payload}")
        except Exception as e:
            logger.error(f"Failed to publish event: {str(e)}")
            raise

    async def get(self, key: str) -> Optional[str]:
        if not self._client:
            await self.connect()
        return self._client.get(key)

    async def set(self, key: str, value: str, expire: int = None):
        if not self._client:
            await self.connect()
        self._client.set(key, value, ex=expire)


# Global redis client instance
redis_client = RedisClient()
