import pytest
from app.database import Base, get_db
from app.main import app
from fastapi.testclient import TestClient
from sqlalchemy import Column, Integer, create_engine
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"


# Minimal User model for testing foreign key relationships
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)


engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def session():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def client(session):
    def override_get_db():
        try:
            yield session
        finally:
            session.close()

    # Mock Redis client for subscription events
    class MockRedisClient:
        async def publish_event(self, event_type, data):
            pass

    # Override dependencies
    app.dependency_overrides[get_db] = override_get_db

    # Mock Redis for subscription events
    from app.core import redis
    from app.routers import subscriptions

    original_redis_client = getattr(redis, "redis_client", None)
    mock_redis = MockRedisClient()
    redis.redis_client = mock_redis
    subscriptions.redis_client = mock_redis  # Also override in subscriptions module

    def create_test_client():
        import asyncio

        import httpx

        class CustomTestClient:
            def __init__(self, app):
                self.app = app
                self.base_url = "http://testserver"
                self.headers = {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                }

            async def _async_request(self, method, url, **kwargs):
                # Convert relative URLs to absolute
                if not url.startswith(("http://", "https://")):
                    url = self.base_url + url

                # Merge headers
                headers = {**self.headers}
                if "headers" in kwargs:
                    headers.update(kwargs["headers"])
                kwargs["headers"] = headers

                # Use AsyncClient with ASGITransport
                transport = httpx.ASGITransport(app=self.app)
                async with httpx.AsyncClient(
                    transport=transport, base_url=self.base_url
                ) as client:
                    return await client.request(method, url, **kwargs)

            def request(self, method, url, **kwargs):
                # Run the async request synchronously
                return asyncio.run(self._async_request(method, url, **kwargs))

            def get(self, url, **kwargs):
                return self.request("GET", url, **kwargs)

            def post(self, url, **kwargs):
                return self.request("POST", url, **kwargs)

            def patch(self, url, **kwargs):
                return self.request("PATCH", url, **kwargs)

            def put(self, url, **kwargs):
                return self.request("PUT", url, **kwargs)

            def delete(self, url, **kwargs):
                return self.request("DELETE", url, **kwargs)

        try:
            client = CustomTestClient(app)
            print("SUCCESS: CustomTestClient worked!")
            return client
        except Exception as e:
            print(f"FAILED: CustomTestClient: {type(e).__name__}: {e}")
            raise RuntimeError(f"Unable to create any test client: {e}")

    test_client = create_test_client()
    yield test_client

    # Clean up
    app.dependency_overrides.clear()
    if original_redis_client:
        redis.redis_client = original_redis_client
