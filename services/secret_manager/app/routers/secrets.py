import logging
from datetime import datetime

import asyncpg
import nats
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..deps import decrypt_secret, encrypt_secret, get_db

router = APIRouter(prefix="/secrets", tags=["secrets"])


async def emit_secret_event(event_type: str, key: str, scope: str):
    """Emit NATS event about secret operation"""
    try:
        nc = await nats.connect(os.getenv("NATS_URL", "nats://nats:4222"))
        await nc.publish(
            f"security.{event_type}",
            payload=f"Secret {event_type}: {key} in scope {scope}".encode(),
        )
        await nc.close()
    except Exception as e:
        logger.error(f"Failed to emit NATS event: {str(e)}")


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SecretCreate(BaseModel):
    key: str
    value: str
    scope: str


class SecretResponse(BaseModel):
    key: str
    scope: str
    created_at: datetime


@router.post("", response_model=SecretResponse)
async def create_secret(secret: SecretCreate, conn=Depends(get_db)):
    """Create a new encrypted secret"""
    try:
        encrypted = await encrypt_secret(conn, secret.value)
        result = await conn.execute(
            "INSERT INTO secrets_management.container_secrets (container_name, username, password) "
            "VALUES ($1, $2, $3) ON CONFLICT (container_name, username) DO UPDATE SET password = $3",
            secret.scope,
            secret.key,
            encrypted,
        )
        await emit_secret_event(
            "rotated" if "UPDATE" in result else "created", secret.key, secret.scope
        )
        return JSONResponse(
            status_code=201,
            content={
                "key": secret.key,
                "scope": secret.scope,
                "created_at": datetime.utcnow().isoformat(),
            },
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(status_code=409, detail="Secret already exists")
    except Exception as e:
        logger.error(f"Failed to create secret: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create secret")


@router.get("/{key}")
async def get_secret(key: str, scope: str = None, conn=Depends(get_db)):
    """Retrieve a decrypted secret"""
    try:
        encrypted = await conn.fetchval(
            "SELECT password FROM secrets_management.container_secrets "
            "WHERE container_name = $1 AND username = $2",
            scope,
            key,
        )
        if not encrypted:
            raise HTTPException(status_code=404, detail="Secret not found")
        decrypted = await decrypt_secret(conn, encrypted)
        return {"value": decrypted}
    except Exception as e:
        logger.error(f"Failed to retrieve secret: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve secret")


@router.delete("/{key}")
async def delete_secret(key: str, scope: str = None, conn=Depends(get_db)):
    """Delete a secret"""
    try:
        result = await conn.execute(
            "DELETE FROM secrets_management.container_secrets "
            "WHERE container_name = $1 AND username = $2",
            scope,
            key,
        )
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Secret not found")
        await emit_secret_event("deleted", key, scope)
        return {"message": "Secret deleted"}
    except Exception as e:
        logger.error(f"Failed to delete secret: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete secret")
