from datetime import datetime, timedelta

import pyotp
from app import crud, models, schemas
from app.core.config import settings
from app.core.redis import redis_client
from app.core.security import (create_access_token, create_refresh_token,
                               get_current_user, get_password_hash,
                               verify_password, verify_token)
from app.database import get_db
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

router = APIRouter(prefix="/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


@router.post(
    "/register",
    response_model=schemas.UserOut,
    summary="Register a new user",
    description="Creates a new user account with the provided email and password",
    responses={
        200: {"description": "User created successfully"},
        400: {"description": "Email already registered"},
        422: {"description": "Validation error"},
    },
)
async def register_user(user_in: schemas.UserCreate, db: Session = Depends(get_db)):
    # Check if user already exists
    db_user = crud.get_user_by_email(db, email=user_in.email)
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    # Hash password and create user
    hashed_password = get_password_hash(user_in.password)
    user = crud.create_user(
        db, user=schemas.UserCreate(email=user_in.email, password=hashed_password)
    )

    # Publish user created event
    event = schemas.EventUserCreated(
        user_id=user.id, email=user.email, timestamp=datetime.utcnow()
    )
    await redis_client.publish_event("user:created", event)

    return user


@router.post(
    "/login",
    response_model=schemas.Token,
    summary="Authenticate user",
    description="Authenticates user credentials and returns JWT tokens",
    responses={
        200: {"description": "Authentication successful"},
        401: {"description": "Invalid credentials"},
        403: {"description": "2FA verification required"},
    },
)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    user = crud.get_user_by_email(db, email=form_data.username)
    if not user or not verify_password(form_data.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    # Check if 2FA is enabled
    if user.totp_secret:
        if not form_data.scopes:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="2FA verification required",
            )

        # Extract TOTP code from scopes
        totp_code = None
        for scope in form_data.scopes:
            if scope.startswith("totp_code:"):
                totp_code = scope.split(":", 1)[1]
                break

        if not totp_code:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="2FA verification required",
            )

        # Verify TOTP code
        totp = pyotp.TOTP(user.totp_secret)
        if not totp.verify(totp_code):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid 2FA code"
            )

    # Generate tokens
    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    refresh_token = create_refresh_token(data={"sub": user.email})

    # Publish login event
    event = schemas.EventUserLogin(
        user_id=user.id, email=user.email, timestamp=datetime.utcnow()
    )
    await redis_client.publish_event("user:login", event)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.post(
    "/refresh",
    response_model=schemas.Token,
    summary="Refresh access token",
    description="Generates a new access token using a valid refresh token",
    responses={
        200: {"description": "Token refreshed successfully"},
        401: {"description": "Invalid refresh token"},
    },
)
async def refresh_token(
    refresh_token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
):
    email = verify_token(refresh_token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )

    user = crud.get_user_by_email(db, email=email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    new_access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    return {
        "access_token": new_access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.post(
    "/2fa/enable",
    response_model=schemas.TOTPEnableResponse,
    summary="Enable 2FA",
    description="Generates a new TOTP secret and returns provisioning URI for authenticator apps",
    responses={
        200: {"description": "2FA enabled successfully"},
        401: {"description": "Unauthorized"},
    },
)
async def enable_2fa(
    current_user: schemas.UserOut = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Generate new TOTP secret
    totp_secret = pyotp.random_base32()
    crud.update_user_totp_secret(db, user_id=current_user.id, totp_secret=totp_secret)

    # Generate provisioning URI for authenticator apps
    provisioning_uri = pyotp.totp.TOTP(totp_secret).provisioning_uri(
        name=current_user.email, issuer_name=settings.PROJECT_NAME
    )

    return {"provisioning_uri": provisioning_uri}


@router.post(
    "/2fa/verify",
    response_model=schemas.Token,
    summary="Verify 2FA code",
    description="Verifies a TOTP code and returns JWT tokens if successful",
    responses={
        200: {"description": "2FA verification successful"},
        400: {"description": "2FA not enabled for user"},
        401: {"description": "Invalid 2FA code"},
    },
)
async def verify_2fa(
    request: schemas.TOTPVerifyRequest,
    current_user: schemas.UserOut = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA not enabled for this user",
        )

    totp = pyotp.TOTP(current_user.totp_secret)
    if not totp.verify(request.code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid 2FA code"
        )

    # Generate tokens
    access_token = create_access_token(
        data={"sub": current_user.email},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    refresh_token = create_refresh_token(data={"sub": current_user.email})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }
