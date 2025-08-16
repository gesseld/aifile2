import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import asyncpg

# Database configuration
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "postgres"),
    "port": os.getenv("DB_PORT", "5432"),
    "user": os.getenv("DB_USER", "aifile"),
    "password": os.getenv("DB_PASSWORD", "aifile123"),
    "database": os.getenv("DB_NAME", "aifile"),
}

# Encryption key (should be from environment in production)
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "aifile123")


@asynccontextmanager
async def get_db() -> AsyncGenerator[asyncpg.Connection, None]:
    """Database connection dependency"""
    conn = await asyncpg.connect(**DB_CONFIG)
    try:
        yield conn
    finally:
        await conn.close()


async def encrypt_secret(conn: asyncpg.Connection, value: str) -> bytes:
    """Encrypt a secret value using PGP"""
    result = await conn.fetchval(
        "SELECT pgp_sym_encrypt($1, $2)", value, ENCRYPTION_KEY
    )
    return result


async def decrypt_secret(conn: asyncpg.Connection, encrypted: bytes) -> str:
    """Decrypt a secret value using PGP"""
    result = await conn.fetchval(
        "SELECT pgp_sym_decrypt($1, $2)", encrypted, ENCRYPTION_KEY
    )
    return result
