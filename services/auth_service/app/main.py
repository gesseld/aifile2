import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

import pyotp
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .core.config import settings
from .core.redis import redis_client
from .crud import (assign_role_to_user, create_user, get_role_by_name,
                   get_user_by_email)
from .database import Base, engine, get_db
from .models import Role, User
from .routers import auth
from .schemas import TokenData

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting auth service")

    # Create database tables
    Base.metadata.create_all(bind=engine)

    # Seed initial admin user if not exists
    db = next(get_db())
    try:
        admin_role = get_role_by_name(db, "admin")
        if not admin_role:
            admin_role = Role(name="admin", description="Administrator role")
            db.add(admin_role)
            db.commit()

        admin_user = get_user_by_email(db, settings.FIRST_ADMIN_EMAIL)
        if not admin_user:
            admin_user = create_user(
                db,
                email=settings.FIRST_ADMIN_EMAIL,
                password=settings.FIRST_ADMIN_PASSWORD,
            )
            assign_role_to_user(db, admin_user.id, admin_role.id)
            logger.info("Created initial admin user")
    finally:
        db.close()

    yield

    # Shutdown
    await redis_client.close()
    logger.info("Auth service stopped")


app = FastAPI(
    title="Auth Service",
    description="Authentication service with JWT, 2FA and RBAC",
    lifespan=lifespan,
)


# Custom exception handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning(
        f"Validation error on {request.method} {request.url}: {exc.errors()}"
    )

    # Clean the errors to make them JSON serializable
    cleaned_errors = []
    for error in exc.errors():
        cleaned_error = {
            "type": error.get("type"),
            "loc": error.get("loc"),
            "msg": error.get("msg"),
            "input": error.get("input"),
        }
        # Add URL if present
        if "url" in error:
            cleaned_error["url"] = error["url"]
        # Clean context - convert any non-serializable objects to strings
        if "ctx" in error:
            ctx = error["ctx"]
            cleaned_ctx = {}
            for key, value in ctx.items():
                if isinstance(value, Exception):
                    cleaned_ctx[key] = str(value)
                else:
                    cleaned_ctx[key] = value
            cleaned_error["ctx"] = cleaned_ctx
        cleaned_errors.append(cleaned_error)

    return JSONResponse(
        status_code=422,
        content={
            "detail": "Validation error",
            "errors": cleaned_errors,
            "error_code": "VALIDATION_ERROR",
            "timestamp": datetime.utcnow().isoformat(),
        },
    )


@app.exception_handler(ValidationError)
async def pydantic_validation_error_handler(request: Request, exc: ValidationError):
    logger.warning(
        f"Pydantic validation error on {request.method} {request.url}: {exc.errors()}"
    )
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Validation error",
            "errors": exc.errors(),
            "error_code": "VALIDATION_ERROR",
            "timestamp": datetime.utcnow().isoformat(),
        },
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    logger.warning(f"Value error on {request.method} {request.url}: {str(exc)}")
    return JSONResponse(
        status_code=422,
        content={
            "detail": str(exc),
            "error_code": "VALIDATION_ERROR",
            "timestamp": datetime.utcnow().isoformat(),
        },
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url}: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "error_code": "INTERNAL_ERROR",
            "timestamp": datetime.utcnow().isoformat(),
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.info(
        f"HTTP exception on {request.method} {request.url}: {exc.status_code} - {exc.detail}"
    )
    content = {"detail": exc.detail, "timestamp": datetime.utcnow().isoformat()}

    # Add error code if present in headers
    if hasattr(exc, "headers") and exc.headers and "error-code" in exc.headers:
        content["error_code"] = exc.headers["error-code"]

    return JSONResponse(status_code=exc.status_code, content=content)


# Include routers with version prefix
app.include_router(auth.router, prefix="/api/v1")


@app.get("/")
def root():
    return {"message": "Auth Service is running"}


@app.get("/health")
def health():
    return {"status": "healthy"}
