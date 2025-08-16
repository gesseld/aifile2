from app.core.redis import redis_client
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db
from .routers import entitlements, plans, subscriptions

app = FastAPI(
    title="Subscription Service",
    description="Manages subscription plans and user subscriptions",
    version="0.1.0",
)

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Initialize database
@app.on_event("startup")
async def startup():
    init_db()
    await redis_client.connect()


@app.on_event("shutdown")
async def shutdown():
    await redis_client.disconnect()


# Include routers
app.include_router(plans.router)
app.include_router(subscriptions.router)
app.include_router(entitlements.router)
