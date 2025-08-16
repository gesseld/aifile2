import os
from typing import Generator

import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")


def get_redis() -> Generator[redis.Redis, None, None]:
    r = redis.Redis.from_url(REDIS_URL)
    try:
        yield r
    finally:
        r.close()
