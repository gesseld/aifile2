import logging

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

from ..deps import get_redis
from ..rate_limiter import rate_limit_middleware

router = APIRouter(prefix="/api/v1/rate_limit", tags=["rate_limit"])
logger = logging.getLogger(__name__)


@router.get("/check")
async def check_rate_limit(
    request: Request,
    userId: str = Query(..., description="User ID to check"),
    action: str = Query(..., description="Action being performed"),
    redis: redis.Redis = Depends(get_redis),
):
    try:
        await rate_limit_middleware(request, redis, userId, action)
        return JSONResponse(
            status_code=200, content={"allowed": True, "message": "Request allowed"}
        )
    except HTTPException as e:
        if e.status_code == 429:
            logger.warning(f"Rate limit exceeded for user {userId}, action {action}")
            return JSONResponse(
                status_code=429,
                content={"allowed": False, "message": "Rate limit exceeded"},
            )
        raise
