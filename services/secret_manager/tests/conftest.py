import os

import asyncpg
import pytest


@pytest.fixture
def test_db_config():
    return {
        "host": os.getenv("TEST_DB_HOST", "localhost"),
        "port": os.getenv("TEST_DB_PORT", "5432"),
        "user": os.getenv("TEST_DB_USER", "postgres"),
        "password": os.getenv("TEST_DB_PASSWORD", "postgres"),
        "database": os.getenv("TEST_DB_NAME", "test_secrets"),
    }


@pytest.fixture
async def test_db(test_db_config):
    """Test database setup and teardown"""
    # Create test database
    conn = await asyncpg.connect(**{**test_db_config, "database": "postgres"})
    await conn.execute(f"DROP DATABASE IF EXISTS {test_db_config['database']}")
    await conn.execute(f"CREATE DATABASE {test_db_config['database']}")
    await conn.close()

    # Setup schema
    conn = await asyncpg.connect(**test_db_config)
    await conn.execute(
        """
        CREATE SCHEMA IF NOT EXISTS secrets_management;
        CREATE TABLE IF NOT EXISTS secrets_management.container_secrets (
            container_name TEXT,
            username TEXT,
            password BYTEA,
            PRIMARY KEY (container_name, username)
        );
    """
    )
    yield conn
    await conn.close()
