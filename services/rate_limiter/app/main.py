import logging
import os
from datetime import datetime

import redis
from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException
from fastapi.responses import JSONResponse

from .deps import get_redis
from .routers import rate_limit

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Rate Limiter Service", description="Redis-based rate limiting service"
)
app.include_router(rate_limit.router)

# Set default rate limit from env
app.state.default_rate_limit = int(os.getenv("DEFAULT_RATE_LIMIT", "60"))


@app.on_event("startup")
async def startup():
    # Test Redis connection
    try:
        r = next(get_redis())
        r.ping()
        logger.info("Connected to Redis successfully")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {str(e)}")
        raise


@app.get("/health")
async def health():
    try:
        r = next(get_redis())
        r.ping()
        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "redis": "connected",
        }
    except Exception as e:
        raise HTTPException(
            status_code=503, detail={"status": "unhealthy", "redis": "disconnected"}
        )


@app.get("/")
def root():
    return {"message": "Rate Limiter Service is running"}
