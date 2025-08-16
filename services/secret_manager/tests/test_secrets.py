import os
from unittest.mock import MagicMock, patch

import asyncpg
import pytest
from app.deps import decrypt_secret, encrypt_secret, get_db
from app.main import app
from fastapi.testclient import TestClient


@pytest.fixture
async def test_db():
    """Test database setup and teardown"""
    test_db_config = {
        "host": os.getenv("TEST_DB_HOST", "localhost"),
        "port": os.getenv("TEST_DB_PORT", "5432"),
        "user": os.getenv("TEST_DB_USER", "postgres"),
        "password": os.getenv("TEST_DB_PASSWORD", "postgres"),
        "database": os.getenv("TEST_DB_NAME", "test_secrets"),
    }

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


@pytest.fixture
def client(test_db):
    """Test client with overridden db dependency"""
    app.dependency_overrides[get_db] = lambda: test_db
    return TestClient(app)


@pytest.mark.asyncio
async def test_create_secret(client):
    """Test creating a secret"""
    response = client.post(
        "/secrets",
        json={"key": "test_key", "value": "test_value", "scope": "test_scope"},
    )
    assert response.status_code == 201
    assert response.json()["key"] == "test_key"
    assert response.json()["scope"] == "test_scope"


@pytest.mark.asyncio
async def test_get_secret(client):
    """Test retrieving a secret"""
    # First create a secret
    await client.post(
        "/secrets",
        json={"key": "test_key", "value": "test_value", "scope": "test_scope"},
    )

    response = client.get("/secrets/test_key?scope=test_scope")
    assert response.status_code == 200
    assert response.json()["value"] == "test_value"


@pytest.mark.asyncio
async def test_delete_secret(client):
    """Test deleting a secret"""
    # First create a secret
    await client.post(
        "/secrets",
        json={"key": "test_key", "value": "test_value", "scope": "test_scope"},
    )

    response = client.delete("/secrets/test_key?scope=test_scope")
    assert response.status_code == 200
    assert response.json()["message"] == "Secret deleted"


@pytest.mark.asyncio
async def test_encryption_decryption(test_db):
    """Test encryption and decryption roundtrip"""
    plaintext = "test_secret_value"
    encrypted = await encrypt_secret(test_db, plaintext)
    decrypted = await decrypt_secret(test_db, encrypted)
    assert decrypted == plaintext
    assert encrypted != plaintext


@pytest.mark.asyncio
async def test_nats_event_emission(client):
    """Test NATS event emission on secret operations"""
    with patch("app.routers.secrets.nats.connect") as mock_connect:
        mock_nc = MagicMock()
        mock_connect.return_value = mock_nc

        # Test create event
        response = client.post(
            "/secrets",
            json={"key": "test_key", "value": "test_value", "scope": "test_scope"},
        )
        assert mock_nc.publish.called
        assert "created" in mock_nc.publish.call_args[0][1].decode()

        # Test delete event
        client.delete("/secrets/test_key?scope=test_scope")
        assert "deleted" in mock_nc.publish.call_args[0][1].decode()
