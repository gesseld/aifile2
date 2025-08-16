from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.core.config import settings
from app.core.redis import RedisClient
from app.database import Base, get_db
from app.main import app
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

engine = create_engine(
    settings.SQLALCHEMY_DATABASE_URI, pool_pre_ping=True, pool_size=20, max_overflow=10
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session")
def test_db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    yield db
    db.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="module")
def mock_redis():
    mock = AsyncMock(spec=RedisClient)
    mock.publish_event = AsyncMock(return_value=True)
    return mock


@pytest.fixture(scope="module")
def client(test_db, mock_redis):
    def override_get_db():
        try:
            yield test_db
        finally:
            test_db.rollback()

    # Override database dependency
    app.dependency_overrides[get_db] = override_get_db

    # Patch the global redis_client instance
    with patch("app.core.redis.redis_client", mock_redis):
        with patch("app.routers.auth.redis_client", mock_redis):
            yield TestClient(app)

    app.dependency_overrides.clear()


@pytest.fixture
def clean_db(test_db):
    """Fixture that uses nested transactions for test isolation"""
    # Start a nested transaction
    test_db.begin_nested()

    # Yield the test database session
    yield test_db

    # Rollback all changes after test
    test_db.rollback()
