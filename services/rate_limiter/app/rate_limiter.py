import time
from typing import Optional

import redis
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


class RateLimiter:
    def __init__(self, redis: redis.Redis, limit: int = 60, window: int = 60):
        self.redis = redis
        self.limit = limit
        self.window = window

    async def check_rate_limit(self, key: str) -> bool:
        current_time = time.time()
        window_start = current_time - self.window

        # Remove old requests
        self.redis.zremrangebyscore(key, 0, window_start)

        # Count requests in current window
        request_count = self.redis.zcard(key)

        if request_count >= self.limit:
            return False

        # Add current request
        self.redis.zadd(key, {str(current_time): current_time})
        self.redis.expire(key, self.window)
        return True


async def rate_limit_middleware(
    request: Request,
    redis: redis.Redis,
    user_id: str,
    action: str,
    limit: Optional[int] = None,
):
    limiter = RateLimiter(
        redis, limit=limit or int(request.app.state.default_rate_limit), window=60
    )

    key = f"rate_limit:{user_id}:{action}"
    allowed = await limiter.check_rate_limit(key)

    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many requests",
            headers={"Retry-After": str(60)},
        )
