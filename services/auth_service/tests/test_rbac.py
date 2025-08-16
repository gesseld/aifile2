import pytest
from app.crud import assign_role_to_user, create_user
from app.main import app
from app.models import Role, User
from app.schemas import UserCreate
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

client = TestClient(app)


@pytest.fixture
def test_users(clean_db: Session):
    # Create test roles
    admin_role = Role(name="admin", description="Administrator")
    user_role = Role(name="user", description="Regular user")
    clean_db.add_all([admin_role, user_role])
    clean_db.commit()

    # Create test users
    admin_user = create_user(
        clean_db, UserCreate(email="admin@example.com", password="adminpass")
    )
    regular_user = create_user(
        clean_db, UserCreate(email="user@example.com", password="userpass")
    )

    # Assign roles
    assign_role_to_user(clean_db, admin_user.id, admin_role.id)
    assign_role_to_user(clean_db, regular_user.id, user_role.id)

    return {"admin": admin_user, "user": regular_user}


def test_admin_access(test_users):
    # Login as admin
    login_response = client.post(
        "/api/v1/auth/login",
        data={"username": "admin@example.com", "password": "adminpass"},
    )
    token = login_response.json()["access_token"]

    # Test admin-only endpoint
    response = client.get(
        "/api/v1/admin/users", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200


def test_user_access_denied(test_users):
    # Login as regular user
    login_response = client.post(
        "/api/v1/auth/login",
        data={"username": "user@example.com", "password": "userpass"},
    )
    token = login_response.json()["access_token"]

    # Test admin-only endpoint (should fail)
    response = client.get(
        "/api/v1/admin/users", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403
    assert response.json() == {"detail": "Insufficient permissions"}


def test_unauthenticated_access():
    # Test admin endpoint without auth
    response = client.get("/api/v1/admin/users")
    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}
