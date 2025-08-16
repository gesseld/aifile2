import json
from datetime import datetime
from typing import Optional

import redis.asyncio as redis
from app.core.config import settings


class RedisClient:
    def __init__(self):
        self.redis: Optional[redis.Redis] = None

    async def connect(self):
        self.redis = redis.from_url(settings.REDIS_URL)

    async def disconnect(self):
        if self.redis:
            await self.redis.close()

    async def publish_event(self, event_type: str, payload: dict):
        if not self.redis:
            raise RuntimeError("Redis client not connected")

        event = {
            "type": event_type,
            "data": payload,
            "timestamp": datetime.utcnow().isoformat(),
        }
        await self.redis.publish(settings.EVENT_CHANNEL, json.dumps(event))


redis_client = RedisClient()
