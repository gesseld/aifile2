import pytest
from app.core.config import settings
from app.core.security import get_password_hash
from app.database import Base, get_db
from app.main import app
from app.models import Role, User
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)


@pytest.fixture(scope="module")
def test_db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()

    # Create test role
    admin_role = Role(name="admin", description="Admin role")
    db.add(admin_role)
    db.commit()

    # Create test user
    test_user = User(
        email="test@example.com",
        password=get_password_hash("testpassword"),
        is_active=True,
    )
    db.add(test_user)
    db.commit()

    yield db

    Base.metadata.drop_all(bind=engine)


def test_register_user(clean_db):
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "newuser@example.com", "password": "securepassword123"},
    )
    assert response.status_code == 200
    assert "email" in response.json()
    assert response.json()["email"] == "newuser@example.com"


def test_login_user(test_db):
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "2fa_user@example.com", "password": "testpassword123"},
    )
    assert response.status_code == 200
    assert "access_token" in response.json()
    assert "refresh_token" in response.json()


def test_protected_route(test_db):
    # First login to get token
    login_response = client.post(
        "/api/v1/auth/login",
        data={"username": "test@example.com", "password": "testpassword"},
    )
    token = login_response.json()["access_token"]

    # Test protected route
    response = client.get(
        "/api/v1/protected", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200


def test_invalid_login(test_db):
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "test@example.com", "password": "wrongpassword"},
    )
    assert response.status_code == 401
    assert response.json() == {"detail": "Incorrect email or password"}
    assert "WWW-Authenticate" in response.headers
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_malformed_jwt(clean_db):
    # Test with malformed token
    response = client.get(
        "/api/v1/protected", headers={"Authorization": "Bearer invalid.token.here"}
    )
    assert response.status_code == 401
    assert response.json() == {"detail": "Could not validate credentials"}


def test_expired_token(clean_db, test_user):
    # Create expired token
    expired_token = create_access_token(
        data={"sub": test_user.email}, expires_delta=timedelta(minutes=-5)
    )
    response = client.get(
        "/api/v1/protected", headers={"Authorization": f"Bearer {expired_token}"}
    )
    assert response.status_code == 401
    assert response.json() == {"detail": "Token expired"}


def test_rate_limiting(clean_db):
    # Test login rate limiting
    for _ in range(5):
        response = client.post(
            "/api/v1/auth/login",
            data={"username": "test@example.com", "password": "wrong"},
        )

    # 6th attempt should be rate limited
    response = client.post(
        "/api/v1/auth/login", data={"username": "test@example.com", "password": "wrong"}
    )
    assert response.status_code == 429
    assert "Retry-After" in response.headers


def test_token_refresh(clean_db, test_user):
    # First get valid refresh token
    login_response = client.post(
        "/api/v1/auth/login",
        data={"username": test_user.email, "password": "testpassword"},
    )
    refresh_token = login_response.json()["refresh_token"]

    # Test refresh flow
    refresh_response = client.post(
        "/api/v1/auth/refresh", headers={"Authorization": f"Bearer {refresh_token}"}
    )
    assert refresh_response.status_code == 200
    assert "access_token" in refresh_response.json()
    assert "refresh_token" in refresh_response.json()
